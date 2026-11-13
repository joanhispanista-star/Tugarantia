#!/usr/bin/env node
/* ===========================================================================
 * MAPA-COLOMBIA — arma panel/mapa/colombia-2026-11b.json, el mapa de la
 * pestaña «🗺️ Mapa» del CRM (panel/mapa-clientes.js).
 * 9 de noviembre de 2026. 13-nov: cada municipio trae dónde va su nombre
 * (`p`) y cada departamento sus huecos (`h`); por eso el archivo cambió de
 * nombre (la «b»): ver panel/mapa/FUENTES.md.
 *
 *   node herramientas/mapa-colombia.js \
 *     --formas <geoBoundaries-COL-ADM2_simplified.geojson> \
 *     --tabla  <COL_AdminBoundaries_TabularData.xlsx> \
 *     [--salida panel/mapa/colombia-2026-11b.json]
 *
 * Las dos descargas NO viven en el repo (pesan 10,6 MB y no son nuestras): se
 * pasan por argumento. De dónde salen, con qué licencia y qué se les hizo está
 * en panel/mapa/FUENTES.md; este guion es lo que permite rehacerlo.
 *
 * POR QUÉ DOS FUENTES. geoBoundaries trae las FORMAS de los 1.122 municipios,
 * pero cada una con un solo dato: `shapeName`, el nombre a secas (a veces con
 * la cabecera entre paréntesis, a veces con otra ortografía, a veces cortado:
 * «Distrito Especial, Industrial Y Portuario De Barr…»). Sin departamento y
 * sin código. La tabla de OCHA/HDX trae lo contrario: 1.122 filas con el
 * nombre oficial, el código DIVIPOLA del DANE y el departamento, sin una sola
 * coordenada. Casarlas es el trabajo de este guion, y se hace sin adivinar:
 *
 *   1. POR NOMBRE. Sin tildes, sin mayúsculas, sin «D.C.», guiones ni
 *      paréntesis; se prueba también lo de dentro y lo de fuera del
 *      paréntesis («Ricaurte (Colosó)» es Colosó, de Sucre) y el nombre sin
 *      espacios («Villa Gómez» es Villagómez). Si una forma tiene una sola
 *      fila posible, y esa fila una sola forma, casan.
 *   2. POR VECINDAD. Los nombres repetidos («Mosquera», en Cundinamarca y en
 *      Nariño) van con el departamento de los vecinos ya casados que tocan la
 *      forma. Dos formas son vecinas si comparten un vértice: geoBoundaries
 *      simplificó guardando la topología, y el 91 % de los vértices distintos
 *      está en más de una forma.
 *   3. POR NOMBRE PARECIDO, CONFIRMADO POR VECINDAD. Cuando el nombre no está
 *      tal cual («Guicán» → «Güicán de la Sierra», «Tiquiso» → «Tiquisio»),
 *      se busca la fila cuyo nombre empieza o termina igual, o difiere en una
 *      letra, y SOLO se acepta si es del departamento de sus vecinos.
 *   4. POR DESCARTE. Lo que queda: una forma, una fila, y nada más que pueda
 *      ser de ninguna de las dos (las dos islas de San Andrés y Providencia,
 *      que no tienen vecinos).
 * Lo que no casa así se imprime y el guion termina con error: no se escribe
 * un mapa con un municipio puesto a ojo.
 *
 * Y LA GEOMETRÍA. Se arma la topología (cada borde compartido, una vez), se
 * proyecta (plate carrée ajustada a 4° N: en Colombia, a esa escala, no se
 * distingue de Mercator), se simplifica cada borde con Douglas-Peucker (el
 * mismo borde para los dos vecinos, así no quedan rendijas) y se redondea a
 * enteros. Los contornos de los departamentos son la UNIÓN de los de sus
 * municipios: los bordes que tocan un solo municipio del departamento. San
 * Andrés y Providencia van en un recuadro arriba a la izquierda, a escala ×3,5,
 * como en los mapas del IGAC: a su tamaño real serían dos puntos.
 *
 * Sin librerías: el .xlsx se abre aquí mismo (es un zip con XML) con zlib.
 * ===========================================================================*/
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { normalizar } = require('../panel/mapa-lugares.js');

/* -------------------------------------------------------------- argumentos */
function argumentos(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(\w+)$/.exec(argv[i]);
    if (m) a[m[1]] = argv[++i];
  }
  return a;
}

/* ------------------------------------------------------------ el .xlsx */
/* Un .xlsx es un zip. Se lee el directorio central del final (no los
   encabezados locales: pueden venir sin tamaños) y se infla cada parte. */
function leerZip(buf) {
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('no es un zip: falta el fin del directorio central');
  const n = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const partes = new Map();
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('directorio central dañado');
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28), largoExtra = buf.readUInt16LE(p + 30), largoNota = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + largoNombre);
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(inicio, inicio + comprimido);
    partes.set(nombre, metodo === 0 ? datos : metodo === 8 ? zlib.inflateRawSync(datos) : null);
    p += 46 + largoNombre + largoExtra + largoNota;
  }
  return partes;
}
function textoXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
  });
}
function leerXlsx(buf) {
  const z = leerZip(buf);
  const leer = n => (z.get(n) ? z.get(n).toString('utf8') : '');
  const compartidas = [...leer('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => textoXml(t[1])).join(''));
  const rels = {};
  for (const m of leer('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0]), destino = /Target="([^"]+)"/.exec(m[0]);
    if (id && destino) rels[id[1]] = destino[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  const hojas = {};
  for (const m of leer('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const nombre = textoXml((/name="([^"]+)"/.exec(m[0]) || [])[1] || '');
    const rid = (/r:id="([^"]+)"/.exec(m[0]) || [])[1];
    const xml = leer(rels[rid] || '');
    const filas = [];
    for (const f of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const fila = [];
      for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (/r="([A-Z]+)\d+"/.exec(c[1]) || [])[1];
        const tipo = (/t="([^"]+)"/.exec(c[1]) || [])[1];
        const cuerpo = c[2] || '';
        let v = (/<v>([\s\S]*?)<\/v>/.exec(cuerpo) || [])[1];
        if (tipo === 's') v = compartidas[Number(v)];
        else if (tipo === 'inlineStr') v = [...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => textoXml(t[1])).join('');
        else if (v != null) v = textoXml(v);
        let col = 0;
        for (const ch of ref || 'A') col = col * 26 + (ch.charCodeAt(0) - 64);
        fila[col - 1] = v == null ? null : v;
      }
      filas.push(fila);
    }
    const cabeza = filas.shift() || [];
    hojas[nombre] = filas.filter(f => f.some(x => x != null && x !== ''))
      .map(f => Object.fromEntries(cabeza.map((h, i) => [h, f[i] == null ? null : f[i]])));
  }
  return hojas;
}

/* ------------------------------------------------------------ el casado */
const compacto = s => s.replace(/ /g, '');
/* Las variantes de un shapeName: entero, lo de fuera del paréntesis, lo de
   dentro (sin «Cor. Departamental», que es la categoría, no un nombre). */
function variantes(nombre) {
  const v = new Set([normalizar(nombre)]);
  const m = /^(.*?)\((.*)\)\s*$/.exec(nombre);
  if (m) {
    v.add(normalizar(m[1]));
    if (!/cor\.?\s*departamental/i.test(m[2])) v.add(normalizar(m[2]));
  }
  v.delete('');
  return [...v];
}
function distanciaUno(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}
/* UN solo nombre a mano: el de Barranquilla viene cortado en geoBoundaries
   («Distrito Especial, Industrial Y Portuario De Barr»). Ninguna regla de
   nombre lo puede reconocer y no hay otro Distrito Especial Industrial y
   Portuario; aun así pasa por la comprobación de vecindad como los demás. */
const A_MANO = { 'distrito especial industrial y portuario de barr': 'barranquilla' };

function casar(formas, filas, vecinos) {
  const nf = filas.map(r => normalizar(r.ADM2_ES));
  const exactos = formas.map(f => {
    const vs = variantes(f.properties.shapeName);
    const cs = vs.map(compacto);
    if (A_MANO[vs[0]]) vs.push(A_MANO[vs[0]]);
    const r = [];
    nf.forEach((n, i) => { if (vs.includes(n) || cs.includes(compacto(n))) r.push(i); });
    return r;
  });
  const parecidos = formas.map(f => {
    const cs = variantes(f.properties.shapeName).map(compacto).filter(c => c.length >= 4);
    const r = [];
    nf.forEach((n, i) => {
      const c = compacto(n);
      if (cs.some(v => c.startsWith(v) || c.endsWith(v) || v.startsWith(c) || (c.length >= 6 && distanciaUno(c, v)))) r.push(i);
    });
    return r;
  });
  const forma = new Array(formas.length).fill(-1);   // forma → fila
  const fila = new Array(filas.length).fill(-1);     // fila → forma
  const via = new Array(formas.length).fill('');
  const depto = i => filas[i].ADM1_PCODE;
  const asignar = (f, r, como) => { forma[f] = r; fila[r] = f; via[f] = como; };
  const libres = l => l.filter(r => fila[r] < 0);
  const deptosVecinos = f => new Set([...vecinos[f]].filter(g => forma[g] >= 0).map(g => depto(forma[g])));

  let hubo = true;
  while (hubo) {
    hubo = false;
    /* 1. por nombre: uno a uno, en las dos direcciones. */
    const reclamos = new Map();
    formas.forEach((_, f) => { if (forma[f] < 0) libres(exactos[f]).forEach(r => reclamos.set(r, (reclamos.get(r) || 0) + 1)); });
    formas.forEach((_, f) => {
      if (forma[f] >= 0) return;
      const l = libres(exactos[f]);
      if (l.length === 1 && reclamos.get(l[0]) === 1) { asignar(f, l[0], 'nombre'); hubo = true; }
    });
    if (hubo) continue;
    /* 2 y 3. por vecindad: entre las filas posibles, las del departamento de
       los vecinos ya casados. Primero las de nombre exacto; si ninguna es de
       ahí, las de nombre parecido. */
    formas.forEach((_, f) => {
      if (forma[f] >= 0 || !vecinos[f].size) return;
      const ds = deptosVecinos(f);
      if (!ds.size) return;
      for (const [lista, como] of [[exactos[f], 'vecindad'], [parecidos[f], 'parecido']]) {
        const l = libres(lista).filter(r => ds.has(depto(r)));
        if (l.length === 1) { asignar(f, l[0], como); hubo = true; return; }
        if (l.length > 1) return;   // dos o más del mismo vecindario: no se escoge
      }
    });
    if (hubo) continue;
    /* 4. por descarte: una forma sin vecinos y una sola fila libre posible
       que ninguna otra forma sin casar reclama. */
    formas.forEach((_, f) => {
      if (forma[f] >= 0 || vecinos[f].size) return;
      const l = libres(exactos[f].length ? exactos[f] : parecidos[f]);
      if (l.length !== 1) return;
      const otra = formas.some((_, g) => g !== f && forma[g] < 0 && (exactos[g].includes(l[0]) || parecidos[g].includes(l[0])));
      if (!otra) { asignar(f, l[0], 'descarte'); hubo = true; }
    });
  }
  return { forma, fila, via };
}

/* ------------------------------------------------------------ la topología */
function anillosDe(geom) {
  const polis = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polis.flat();
}
function topologia(formas) {
  const id = new Map(), lon = [], lat = [];
  const punto = p => {
    const k = p[0] + ',' + p[1];
    let i = id.get(k);
    if (i === undefined) { i = lon.length; id.set(k, i); lon.push(+p[0]); lat.push(+p[1]); }
    return i;
  };
  const anillos = formas.map(f => anillosDe(f.geometry).map(a => {
    const r = a.map(punto);
    if (r.length > 1 && r[0] === r[r.length - 1]) r.pop();
    return r.filter((x, i) => x !== r[(i + r.length - 1) % r.length]);
  }).filter(r => r.length >= 3));
  /* Vecinos de cada punto y dueños de cada punto. */
  const junto = lon.map(() => new Set()), duenos = lon.map(() => new Set());
  anillos.forEach((as, f) => as.forEach(r => r.forEach((x, i) => {
    junto[x].add(r[(i + 1) % r.length]); junto[x].add(r[(i + r.length - 1) % r.length]); duenos[x].add(f);
  })));
  const nudo = junto.map(s => s.size > 2);
  const vecinos = formas.map(() => new Set());
  duenos.forEach(s => { if (s.size > 1) for (const a of s) for (const b of s) if (a !== b) vecinos[a].add(b); });

  const arcos = [], llave = new Map();
  const guardar = seq => {
    const k = seq.join(','), kr = seq.slice().reverse().join(',');
    if (llave.has(k)) return { a: llave.get(k), rev: false };
    if (llave.has(kr)) return { a: llave.get(kr), rev: true };
    llave.set(k, arcos.length); arcos.push(seq);
    return { a: arcos.length - 1, rev: false };
  };
  const refs = anillos.map(as => as.map(r => {
    const n = r.length;
    let s = r.findIndex(x => nudo[x]);
    if (s < 0) {
      /* Un anillo sin nudos (una isla): un solo arco cerrado, empezando por
         su punto de menor número para que el mismo anillo dé la misma llave. */
      let m = 0; for (let i = 1; i < n; i++) if (r[i] < r[m]) m = i;
      const seq = r.slice(m).concat(r.slice(0, m)); seq.push(seq[0]);
      return [guardar(seq)];
    }
    const rot = r.slice(s).concat(r.slice(0, s)); rot.push(rot[0]);
    const partes = []; let ini = 0;
    for (let i = 1; i < rot.length; i++) {
      if (nudo[rot[i]] || i === rot.length - 1) { partes.push(guardar(rot.slice(ini, i + 1))); ini = i; }
    }
    return partes;
  }));
  return { lon, lat, arcos, refs, vecinos };
}

/* ------------------------------------------------------------ proyección */
const ESCALA = 480;          // unidades por grado de latitud: 1 unidad ≈ 231 m
const COS = Math.cos(4 * Math.PI / 180);
const MARGEN = 40;
/* ×3,5 y no más: con ×4 la esquina del recuadro tocaba el cabo Tiburón
   (Acandí). construir() comprueba que no se monte sobre tierra firme. */
const RECUADRO_X4 = 3.5;

function douglasPeucker(xs, ys, tol) {
  const n = xs.length, guardo = new Uint8Array(n);
  guardo[0] = guardo[n - 1] = 1;
  const pila = [[0, n - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    let max = -1, k = -1;
    const dx = xs[b] - xs[a], dy = ys[b] - ys[a], L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = L === 0 ? Math.hypot(xs[i] - xs[a], ys[i] - ys[a]) : Math.abs(dy * xs[i] - dx * ys[i] + xs[b] * ys[a] - ys[b] * xs[a]) / L;
      if (d > max) { max = d; k = i; }
    }
    if (max > tol) { guardo[k] = 1; pila.push([a, k], [k, b]); }
  }
  return guardo;
}

/* ------------------------------------------------------------ las etiquetas */
/* 13-nov-2026 — DÓNDE VA EL NOMBRE DE CADA MUNICIPIO. Joan: «no se ven los
   municipios». El centro de la caja no sirve: en un municipio en forma de C
   (o de bota, como Bogotá con Sumapaz) cae afuera, encima del vecino. Se usa
   el polo de inaccesibilidad: el punto de adentro más lejos de todo borde, el
   centro del círculo más grande que cabe. Se busca partiendo la caja en
   celdas y abriendo primero la que más promete, hasta que ninguna pueda
   mejorar en más de `precision` unidades. Los anillos van con la regla par-
   impar (un hueco dentro de un municipio es afuera), así que sirve igual con
   islas y con agujeros. */
function distanciaAlBorde(x, y, anillos) {
  let dentro = false, min = Infinity;
  for (const r of anillos) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) dentro = !dentro;
      let px = a[0], py = a[1];
      const dx = b[0] - px, dy = b[1] - py;
      if (dx || dy) {
        const t = ((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy);
        if (t > 1) { px = b[0]; py = b[1]; } else if (t > 0) { px += dx * t; py += dy * t; }
      }
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < min) min = d;
    }
  }
  return (dentro ? 1 : -1) * Math.sqrt(min);
}
function poloDeInaccesibilidad(anillos, precision) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  anillos.forEach(r => r.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
  const lado = Math.min(x1 - x0, y1 - y0);
  if (!(lado > 0)) return { x: x0, y: y0, d: 0 };
  const celda = (x, y, h) => { const d = distanciaAlBorde(x, y, anillos); return { x, y, h, d, max: d + h * Math.SQRT2 }; };
  /* Un montón binario por `max`: la celda que más promete sale primero. */
  const monton = [];
  const meter = c => {
    monton.push(c);
    for (let i = monton.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (monton[p].max >= monton[i].max) break;
      [monton[p], monton[i]] = [monton[i], monton[p]]; i = p;
    }
  };
  const sacar = () => {
    const top = monton[0], ult = monton.pop();
    if (monton.length) {
      monton[0] = ult;
      for (let i = 0; ;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i;
        if (a < monton.length && monton[a].max > monton[m].max) m = a;
        if (b < monton.length && monton[b].max > monton[m].max) m = b;
        if (m === i) break;
        [monton[m], monton[i]] = [monton[i], monton[m]]; i = m;
      }
    }
    return top;
  };
  const h = lado / 2;
  for (let x = x0; x < x1; x += lado) for (let y = y0; y < y1; y += lado) meter(celda(x + h, y + h, h));
  /* El primer candidato: el centro del anillo más grande (casi siempre adentro). */
  const mayor = anillos.reduce((m, r) => (r.length > m.length ? r : m), anillos[0]);
  let mejor = celda(mayor.reduce((t, p) => t + p[0], 0) / mayor.length, mayor.reduce((t, p) => t + p[1], 0) / mayor.length, 0);
  const centro = celda((x0 + x1) / 2, (y0 + y1) / 2, 0);
  if (centro.d > mejor.d) mejor = centro;
  while (monton.length) {
    const c = sacar();
    if (c.d > mejor.d) mejor = c;
    if (c.max - mejor.d <= precision) continue;
    const m = c.h / 2;
    meter(celda(c.x - m, c.y - m, m)); meter(celda(c.x + m, c.y - m, m));
    meter(celda(c.x - m, c.y + m, m)); meter(celda(c.x + m, c.y + m, m));
  }
  return mejor;
}

/* 13-nov-2026 — LOS HUECOS. Al abrir Cundinamarca, Bogotá quedaba como un
   hueco blanco justo donde están la mayoría de los clientes: es su propio
   departamento y la vista de un departamento solo pintaba los suyos. Un
   municipio es «hueco» de otro departamento cuando DOS TERCIOS o más de su
   borde los comparte con municipios de ese departamento: visto desde allá,
   es una muesca en blanco. Con la mitad salían 43, casi todos municipios de
   frontera que no se ven como hueco; con dos tercios quedan seis, los que de
   verdad se meten en el otro (Bogotá en Cundinamarca, 83 %; Covarachía en
   Santander; González en Norte de Santander; Gámbita en Boyacá; Quinchía en
   Caldas; Jamundí en el Cauca). Se mide con los bordes ya simplificados (los
   mismos que se dibujan). */
const UMBRAL_HUECO = 2 / 3;
function huecos(refs, arcosQ, deptoDeForma) {
  const largo = arcosQ.map(a => {
    let t = 0;
    for (let i = 1; i < a.length; i++) t += Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]);
    return t;
  });
  const usan = arcosQ.map(() => new Set());
  refs.forEach((as, f) => as.forEach(r => r.forEach(({ a }) => usan[a].add(f))));
  const r = [];
  refs.forEach((as, f) => {
    const mio = deptoDeForma(f);
    let total = 0;
    const con = new Map();
    as.forEach(an => an.forEach(({ a }) => {
      total += largo[a];
      const otros = new Set([...usan[a]].filter(g => g !== f).map(deptoDeForma).filter(d => d !== mio));
      otros.forEach(d => con.set(d, (con.get(d) || 0) + largo[a]));
    }));
    con.forEach((l, d) => { if (total > 0 && l / total >= UMBRAL_HUECO) r.push({ f, depto: d, parte: l / total }); });
  });
  return r;
}

function construir(formasGeo, filas, casado, tolerancia) {
  const topo = topologia(formasGeo);
  const deptoDeForma = f => filas[casado.forma[f]].ADM1_PCODE.slice(2);
  const enRecuadro = f => deptoDeForma(f) === '88';
  /* La caja de tierra firme. */
  let lonMin = Infinity, latMax = -Infinity, lonMax = -Infinity, latMin = Infinity;
  const isla = new Uint8Array(topo.lon.length);
  topo.refs.forEach((as, f) => as.forEach(r => r.forEach(({ a }) => topo.arcos[a].forEach(p => {
    if (enRecuadro(f)) { isla[p] = 1; return; }
    lonMin = Math.min(lonMin, topo.lon[p]); lonMax = Math.max(lonMax, topo.lon[p]);
    latMin = Math.min(latMin, topo.lat[p]); latMax = Math.max(latMax, topo.lat[p]);
  }))));
  const ancho = Math.ceil((lonMax - lonMin) * COS * ESCALA) + 2 * MARGEN;
  const alto = Math.ceil((latMax - latMin) * ESCALA) + 2 * MARGEN;
  /* El recuadro de San Andrés y Providencia: su caja, a ×4, arriba a la izquierda. */
  let iLon0 = Infinity, iLon1 = -Infinity, iLat0 = Infinity, iLat1 = -Infinity;
  topo.lon.forEach((x, p) => { if (isla[p]) { iLon0 = Math.min(iLon0, x); iLon1 = Math.max(iLon1, x); iLat0 = Math.min(iLat0, topo.lat[p]); iLat1 = Math.max(iLat1, topo.lat[p]); } });
  const cosI = Math.cos(((iLat0 + iLat1) / 2) * Math.PI / 180);
  const holgura = 30;
  const recuadro = { x: MARGEN, y: MARGEN,
    w: Math.ceil((iLon1 - iLon0) * cosI * ESCALA * RECUADRO_X4) + 2 * holgura,
    h: Math.ceil((iLat1 - iLat0) * ESCALA * RECUADRO_X4) + 2 * holgura, escala: RECUADRO_X4 };
  const px = new Float64Array(topo.lon.length), py = new Float64Array(topo.lon.length);
  const holguraTierra = 20;
  topo.lon.forEach((x, p) => {
    if (!isla[p]) {
      const tx = MARGEN + (x - lonMin) * COS * ESCALA, ty = MARGEN + (latMax - topo.lat[p]) * ESCALA;
      if (tx < recuadro.x + recuadro.w + holguraTierra && ty < recuadro.y + recuadro.h + holguraTierra) {
        throw new Error('el recuadro de San Andrés se monta sobre tierra firme en (' + Math.round(tx) + ', ' + Math.round(ty) + '): bájale la escala');
      }
    }
    if (isla[p]) {
      px[p] = recuadro.x + holgura + (x - iLon0) * cosI * ESCALA * RECUADRO_X4;
      py[p] = recuadro.y + holgura + (iLat1 - topo.lat[p]) * ESCALA * RECUADRO_X4;
    } else {
      px[p] = MARGEN + (x - lonMin) * COS * ESCALA;
      py[p] = MARGEN + (latMax - topo.lat[p]) * ESCALA;
    }
  });

  /* Cada arco, simplificado una vez y redondeado. Los extremos (los nudos) no
     se mueven: así los dos vecinos siguen pegados. Un arco cerrado (isla) se
     parte en su punto más lejano para que Douglas-Peucker tenga dos extremos,
     y nunca queda con menos de cuatro puntos. */
  const arcosQ = topo.arcos.map(seq => {
    const xs = seq.map(p => px[p]), ys = seq.map(p => py[p]);
    let g;
    const cerrado = seq[0] === seq[seq.length - 1];
    if (cerrado) {
      let k = 1, max = -1;
      for (let i = 1; i < seq.length - 1; i++) { const d = Math.hypot(xs[i] - xs[0], ys[i] - ys[0]); if (d > max) { max = d; k = i; } }
      const g1 = douglasPeucker(xs.slice(0, k + 1), ys.slice(0, k + 1), tolerancia);
      const g2 = douglasPeucker(xs.slice(k), ys.slice(k), tolerancia);
      g = new Uint8Array(seq.length); g1.forEach((v, i) => { g[i] = v; }); g2.forEach((v, i) => { if (v) g[k + i] = 1; });
      let quedan = g.reduce((t, v) => t + v, 0);
      for (let t = tolerancia / 2; quedan < 4 && t > 0.01; t /= 2) {
        const h1 = douglasPeucker(xs.slice(0, k + 1), ys.slice(0, k + 1), t), h2 = douglasPeucker(xs.slice(k), ys.slice(k), t);
        h1.forEach((v, i) => { if (v) g[i] = 1; }); h2.forEach((v, i) => { if (v) g[k + i] = 1; });
        quedan = g.reduce((s, v) => s + v, 0);
      }
    } else g = douglasPeucker(xs, ys, tolerancia);
    const r = [];
    seq.forEach((p, i) => {
      if (!g[i]) return;
      const q = [Math.round(px[p]), Math.round(py[p])];
      const u = r[r.length - 1];
      if (!u || u[0] !== q[0] || u[1] !== q[1]) r.push(q);
    });
    return r;
  });

  /* Un anillo, de sus arcos a la lista de puntos. */
  const puntosDe = anillo => {
    const pts = [];
    anillo.forEach(({ a, rev }) => {
      const s = rev ? arcosQ[a].slice().reverse() : arcosQ[a];
      s.forEach((q, i) => { const u = pts[pts.length - 1]; if (i === 0 && u && u[0] === q[0] && u[1] === q[1]) return; pts.push(q); });
    });
    if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a[0] === b[0] && a[1] === b[1]) pts.pop(); }
    return pts;
  };
  /* El «d» de un <path>: M absoluto por anillo y el resto relativo (l), con
     el signo menos haciendo de separador. */
  const caja = () => [Infinity, Infinity, -Infinity, -Infinity];
  const ruta = (anillos, b) => {
    let d = '';
    anillos.forEach(pts => {
      if (pts.length < 3) return;
      d += 'M' + pts[0][0] + ' ' + pts[0][1] + 'l';
      let ant = 'l';
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        for (const v of [dx, dy]) { d += (v < 0 || ant === 'l') ? String(v) : ' ' + v; ant = ''; }
      }
      d += 'z';
      if (b) pts.forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); });
    });
    return d;
  };

  /* `p`: dónde va el nombre (ver poloDeInaccesibilidad), en enteros como todo. */
  const municipios = formasGeo.map((f, i) => {
    const r = filas[casado.forma[i]];
    const anillos = topo.refs[i].map(puntosDe).filter(a => a.length >= 3);
    const polo = poloDeInaccesibilidad(anillos, 1);
    return { c: r.ADM2_PCODE.slice(2), n: r.ADM2_ES, p: [Math.round(polo.x), Math.round(polo.y)], d: ruta(anillos) };
  }).sort((a, b) => a.c.localeCompare(b.c));
  const codigoDe = f => filas[casado.forma[f]].ADM2_PCODE.slice(2);
  const losHuecos = huecos(topo.refs, arcosQ, deptoDeForma)
    .map(h => ({ c: codigoDe(h.f), n: filas[casado.forma[h.f]].ADM2_ES, depto: h.depto, parte: h.parte }))
    .sort((a, b) => a.depto.localeCompare(b.depto) || a.c.localeCompare(b.c));

  /* Departamentos: la unión de sus municipios. Un arco que aparece dos veces
     dentro del mismo departamento es un borde interno y se va; los que quedan
     se encadenan por sus extremos en anillos cerrados. */
  const porDepto = new Map();
  topo.refs.forEach((as, f) => {
    const d = deptoDeForma(f);
    if (!porDepto.has(d)) porDepto.set(d, []);
    as.forEach(r => r.forEach(ref => porDepto.get(d).push(ref)));
  });
  const nombresDepto = new Map(filas.map(r => [r.ADM1_PCODE.slice(2), r.ADM1_ES]));
  const departamentos = [...porDepto.keys()].sort().map(d => {
    const usos = new Map();
    porDepto.get(d).forEach(ref => usos.set(ref.a, (usos.get(ref.a) || 0) + 1));
    const borde = porDepto.get(d).filter(ref => usos.get(ref.a) === 1);
    const ini = ref => { const s = topo.arcos[ref.a]; return ref.rev ? s[s.length - 1] : s[0]; };
    const fin = ref => { const s = topo.arcos[ref.a]; return ref.rev ? s[0] : s[s.length - 1]; };
    const desde = new Map();
    borde.forEach((ref, i) => { const k = ini(ref); if (!desde.has(k)) desde.set(k, []); desde.get(k).push(i); });
    const usado = new Uint8Array(borde.length), anillos = [];
    for (let i = 0; i < borde.length; i++) {
      if (usado[i]) continue;
      const anillo = []; let j = i;
      while (j >= 0 && !usado[j]) {
        usado[j] = 1; anillo.push(borde[j]);
        const sig = (desde.get(fin(borde[j])) || []).find(k => !usado[k]);
        j = sig === undefined ? -1 : sig;
      }
      anillos.push(anillo);
    }
    const b = caja();
    const dd = ruta(anillos.map(puntosDe), b);
    return { c: d, n: nombresDepto.get(d), m: filas.filter(r => r.ADM1_PCODE.slice(2) === d).length, d: dd, b };
  });
  departamentos.forEach(d => { d.h = losHuecos.filter(h => h.depto === d.c).map(h => h.c); });
  return { municipios, departamentos, ancho, alto, recuadro, huecos: losHuecos, puntos: arcosQ.reduce((t, a) => t + a.length, 0), vecinos: topo.vecinos };
}

/* Los nombres que la tabla escribió sin tilde, y el corto para la pantalla. */
const NOMBRE_DEPTO = { '63': 'Quindío' };
const CORTO_DEPTO = { '11': 'Bogotá D.C.', '88': 'San Andrés y Providencia' };

/* ------------------------------------------------------------ todo junto */
function main() {
  const a = argumentos(process.argv.slice(2));
  if (!a.formas || !a.tabla) {
    console.error('uso: node herramientas/mapa-colombia.js --formas <geojson de geoBoundaries> --tabla <xlsx de HDX> [--salida <json>] [--tolerancia 1.2]');
    process.exit(2);
  }
  const salida = a.salida || path.join(__dirname, '..', 'panel', 'mapa', 'colombia-2026-11b.json');
  const tolerancia = Number(a.tolerancia) || 1.2;
  const geo = JSON.parse(fs.readFileSync(a.formas, 'utf8'));
  const hojas = leerXlsx(fs.readFileSync(a.tabla));
  const filas = hojas.ADM2 || [];
  const formas = geo.features || [];
  console.log('formas (geoBoundaries ADM2):', formas.length, '· filas (HDX ADM2):', filas.length, '· departamentos (HDX ADM1):', (hojas.ADM1 || []).length);

  const topo = topologia(formas);
  const casado = casar(formas, filas, topo.vecinos);
  const cuentas = {}; casado.via.forEach(v => { cuentas[v || 'sin casar'] = (cuentas[v || 'sin casar'] || 0) + 1; });
  console.log('casado:', JSON.stringify(cuentas));
  const sinForma = filas.map((r, i) => (casado.fila[i] < 0 ? r.ADM2_PCODE + ' ' + r.ADM2_ES + ' (' + r.ADM1_ES + ')' : null)).filter(Boolean);
  const sinFila = formas.map((f, i) => (casado.forma[i] < 0 ? f.properties.shapeName : null)).filter(Boolean);
  if (sinForma.length || sinFila.length) {
    console.error('NO CASARON — formas sin fila:', sinFila.join('; ') || 'ninguna');
    console.error('NO CASARON — filas sin forma:', sinForma.join('; ') || 'ninguna');
    process.exit(1);
  }
  /* Lo que no casó por el nombre tal cual, para FUENTES.md. */
  formas.forEach((f, i) => {
    if (casado.via[i] === 'nombre') return;
    const r = filas[casado.forma[i]];
    console.log('  ' + casado.via[i].padEnd(9) + ' «' + f.properties.shapeName + '» → ' + r.ADM2_PCODE.slice(2) + ' ' + r.ADM2_ES + ' (' + r.ADM1_ES + ')');
  });
  /* La comprobación de vecindad sobre TODO lo casado: un municipio de tierra
     firme que no toca a ningún otro de su departamento está mal casado (o su
     departamento es de un solo municipio, como Bogotá). */
  const solos = [];
  formas.forEach((f, i) => {
    const d = filas[casado.forma[i]].ADM1_PCODE;
    if (!topo.vecinos[i].size) return;
    const mismos = [...topo.vecinos[i]].filter(g => filas[casado.forma[g]].ADM1_PCODE === d).length;
    const deptoDeUno = filas.filter(r => r.ADM1_PCODE === d).length === 1;
    if (!mismos && !deptoDeUno) solos.push(f.properties.shapeName + ' → ' + filas[casado.forma[i]].ADM1_ES);
  });
  if (solos.length) { console.error('SIN VECINOS DE SU DEPARTAMENTO:', solos.join('; ')); process.exit(1); }

  /* La cuenta oficial por departamento (la tabla del DANE vía HDX) contra lo
     que quedó en el mapa. */
  const oficial = {}, enMapa = {};
  filas.forEach(r => { oficial[r.ADM1_PCODE] = (oficial[r.ADM1_PCODE] || 0) + 1; });
  formas.forEach((f, i) => { const d = filas[casado.forma[i]].ADM1_PCODE; enMapa[d] = (enMapa[d] || 0) + 1; });
  const malas = Object.keys(oficial).filter(d => oficial[d] !== enMapa[d]);
  console.log('departamentos:', Object.keys(oficial).length, '· que no suman:', malas.length ? malas.join(', ') : 'ninguno',
    '· total en el mapa:', Object.values(enMapa).reduce((t, x) => t + x, 0));

  const mapa = construir(formas, filas, casado, tolerancia);
  mapa.departamentos.forEach(d => {
    if (NOMBRE_DEPTO[d.c]) d.n = NOMBRE_DEPTO[d.c];
    if (CORTO_DEPTO[d.c]) d.corto = CORTO_DEPTO[d.c];
  });
  const json = {
    version: '2026-11b',
    nota: 'Generado por herramientas/mapa-colombia.js. Ver panel/mapa/FUENTES.md.',
    creditos: 'Límites: DANE, vía geoBoundaries (CC BY 4.0) y OCHA/HDX (CC BY-IGO)',
    proyeccion: 'plate carrée ajustada a 4° N, ' + ESCALA + ' unidades por grado de latitud; San Andrés y Providencia en recuadro a ×' + RECUADRO_X4,
    caja: [mapa.ancho, mapa.alto],
    recuadro: { x: mapa.recuadro.x, y: mapa.recuadro.y, w: mapa.recuadro.w, h: mapa.recuadro.h, depto: '88' },
    /* `h`: los municipios de OTRO departamento que, vistos desde este, son
       un hueco (ver huecos()). Solo va cuando hay alguno. */
    departamentos: mapa.departamentos.map(d => Object.assign({ c: d.c, n: d.n }, d.corto ? { corto: d.corto } : {}, { m: d.m, b: d.b },
      d.h.length ? { h: d.h } : {}, { d: d.d })),
    municipios: mapa.municipios
  };
  console.log('huecos (municipio → departamento desde el que se ve como hueco, parte de su borde):');
  mapa.huecos.forEach(h => console.log('  ' + h.c + ' ' + h.n + ' → ' + h.depto + ' ' + Math.round(h.parte * 100) + ' %'));
  const texto = JSON.stringify(json);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, texto);
  console.log('puntos tras simplificar:', mapa.puntos, '· caja:', mapa.ancho + '×' + mapa.alto,
    '· recuadro:', JSON.stringify(json.recuadro), '· tolerancia:', tolerancia);
  console.log('escrito', path.relative(process.cwd(), salida), '·', (Buffer.byteLength(texto) / 1024).toFixed(1), 'KB');
}

if (require.main === module) main();
module.exports = { leerXlsx, variantes, casar, topologia, construir, distanciaUno, poloDeInaccesibilidad, distanciaAlBorde, huecos, UMBRAL_HUECO };
