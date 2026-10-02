/* ===========================================================================
 * EL BANCO DE PRUEBAS DE panel/nube-crm.js
 * 1 de octubre de 2026 (segunda vuelta). Salió de pruebas/nube-crm.test.js tal
 * cual, sin cambiar una línea, para que pruebas/nube-crm-revision.test.js use
 * los MISMOS dobles: un panel_empujar con las tres ramas del SQL, la pestaña de
 * mentira con el contrato de sello de crm.html, y las carteras. Dos copias de
 * un doble se separan, y entonces cada prueba prueba otra cosa.
 * No termina en .test.js a propósito: no es una prueba, es un banco.
 * ========================================================================= */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const N = require('../panel/nube.js');
const { crear } = require('../panel/nube-crm.js');

const RAIZ = path.join(__dirname, '..');
const KEY = 'joan_socios_v1';
const ESPEJO = 'joan_panel_espejo_pc';
const SELLO = 'joan_crm_sello';
const ESTADO = 'joan_crm_nube';
const DUENO = 'joan_crm_sync_dueno';
const TABLAS = ['socios', 'creditos', 'respaldados'];
const CAMPO = { socios: 'socios', creditos: 'prestamos', respaldados: 'respaldados' };
const clon = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function azar(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ dobles */

/* Un localStorage de mentira que anota cada escritura (en orden) y que se
   puede llenar para UNA llave, como un navegador sin espacio. */
function almacenDoble() {
  const datos = {};
  const a = {
    datos, escrituras: [], llenas: {},
    getItem: k => (Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null),
    setItem: (k, v) => {
      if (a.llenas[k]) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      a.escrituras.push(k); datos[k] = String(v);
    },
    removeItem: k => { a.escrituras.push('-' + k); delete datos[k]; }
  };
  return a;
}

/* jsonb no guarda el orden de las llaves: las ordena por largo y después por
   bytes. Se imita, para que una comparación que no sea canónica se caiga acá
   y no en la nube de Joan. */
function comoJsonb(v) {
  if (Array.isArray(v)) return v.map(comoJsonb);
  if (!v || typeof v !== 'object') return v;
  const o = {};
  Object.keys(v).sort((x, y) => (x.length - y.length) || (x < y ? -1 : x > y ? 1 : 0))
    .forEach(k => { o[k] = comoJsonb(v[k]); });
  return o;
}

/* panel_empujar, panel_traer y panel_sembrar_contador, con la MISMA regla del
   SQL (base/20260811_panel_nube.sql:415-459). */
function servidor() {
  const S = { socios: {}, creditos: {}, respaldados: {}, ajustes: {}, lotes: [], choquesTabla: 0,
              contadores: { cliente: 0, credito: 0, respaldado: 0 }, sembrados: [], hora: 0 };
  const cuando = () => new Date(Date.UTC(2026, 9, 1, 12, 0, S.hora++)).toISOString();
  function escribir(tabla, llave, f, disp, r, esAjuste) {
    const actual = tabla[llave];
    const base = Number(f.revision_base) || 0;
    let choque = false, rev = null;
    if (!actual) {
      if (base !== 0) choque = true;
      else {
        const datos = (f.datos && typeof f.datos === 'object') ? f.datos : (f.borrado ? {} : null);
        if (datos === null) throw new Error('fila ' + llave + ' sin datos');
        tabla[llave] = { datos: comoJsonb(clon(datos)), revision: 1, borrado: !!f.borrado, actualizado_por: disp, actualizado_en: cuando() };
        rev = 1;
      }
    } else if (actual.revision === base) {
      const datos = (f.datos && typeof f.datos === 'object') ? f.datos : (f.borrado ? {} : null);
      if (datos === null) throw new Error('fila ' + llave + ' sin datos');
      actual.datos = comoJsonb(clon(datos)); actual.revision++; actual.borrado = esAjuste ? false : !!f.borrado;
      actual.actualizado_por = disp; actual.actualizado_en = cuando();
      rev = actual.revision;
    } else choque = true;
    return { choque, rev };
  }
  S.empujar = function (disp, lote) {
    S.lotes.push(clon(lote));
    const r = { aplicados: 0, revisiones: [], choques: [] };
    TABLAS.forEach(t => (lote[t] || []).forEach(f => {
      const x = escribir(S[t], String(f.id), f, disp, r, false);
      if (x.choque) {
        S.choquesTabla++;
        const a = S[t][f.id];
        r.choques.push({ tabla: t, id: String(f.id), revision_servidor: a ? a.revision : null,
          datos_servidor: a ? clon(a.datos) : null, actualizado_por: a ? a.actualizado_por : null,
          actualizado_en: a ? a.actualizado_en : null });
      } else { r.aplicados++; r.revisiones.push({ tabla: t, id: String(f.id), revision: x.rev }); }
    }));
    (lote.ajustes || []).forEach(a => {
      const x = escribir(S.ajustes, String(a.clave), a, disp, r, true);
      if (x.choque) {
        S.choquesTabla++;
        const s = S.ajustes[a.clave];
        r.choques.push({ tabla: 'ajustes', id: String(a.clave), revision_servidor: s ? s.revision : null, datos_servidor: s ? clon(s.datos) : null });
      } else { r.aplicados++; r.revisiones.push({ tabla: 'ajustes', id: String(a.clave), revision: x.rev }); }
    });
    return Promise.resolve(r);
  };
  S.traer = function () {
    const p = { servidor_ahora: cuando(), completo: true, socios: [], creditos: [], respaldados: [], ajustes: [], contadores: clon(S.contadores) };
    TABLAS.forEach(t => Object.keys(S[t]).forEach(id => {
      const a = S[t][id];
      p[t].push({ id, datos: clon(a.datos), revision: a.revision, borrado: a.borrado, actualizado_en: a.actualizado_en, actualizado_por: a.actualizado_por });
    }));
    Object.keys(S.ajustes).forEach(k => {
      const a = S.ajustes[k];
      p.ajustes.push({ clave: k, datos: clon(a.datos), revision: a.revision, actualizado_en: a.actualizado_en });
    });
    return Promise.resolve(p);
  };
  S.sembrarContador = function (k, v) {
    S.sembrados.push([k, v]);
    S.contadores[k] = Math.max(S.contadores[k] || 0, v);
    return Promise.resolve(S.contadores[k]);
  };
  /* El celular escribe una fila: sube su revisión, como haría su cola. */
  S.celular = function (t, id, cambio) {
    const a = S[t][id];
    const d = clon(a.datos); cambio(d);
    a.datos = comoJsonb(d); a.revision++; a.actualizado_por = 'celular'; a.actualizado_en = cuando();
  };
  return S;
}

/* La huella de crm.html: FNV-1a de 32 bits. La prueba de integración de abajo
   comprueba que la de crm.html da lo mismo: si se separan, esta pestaña de
   mentira dejaría de parecerse a la de verdad. */
function fnv(t) {
  t = String(t == null ? '' : t);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/* Una pestaña del CRM con el MISMO contrato de sello que crm.html: guardar()
   pregunta si la cartera es ajena, escribe, suelta el espejo si pisó algo
   ajeno, y sella. */
function pestana(alm, quien) {
  const p = { quien, v: 0, mio: null };
  p.sellar = t => { p.mio = { v: ++p.v, quien, largo: t.length, huella: fnv(t) }; alm.setItem(SELLO, JSON.stringify(p.mio)); };
  p.guardar = db => {
    const antes = alm.getItem(KEY) || '';
    const ajena = !!p.mio && (antes.length !== p.mio.largo || fnv(antes) !== p.mio.huella);
    const t = JSON.stringify(db);
    alm.setItem(KEY, t);
    if (ajena) alm.removeItem(ESPEJO);
    p.sellar(t);
  };
  p.leer = () => { const t = alm.getItem(KEY) || ''; p.mio = { v: p.v, quien, largo: t.length, huella: fnv(t) }; return JSON.parse(t || '{}'); };
  p.reclamar = () => {
    const t = alm.getItem(KEY) || '';
    if (!p.mio || t.length !== p.mio.largo || fnv(t) !== p.mio.huella) return false;
    p.sellar(t); return true;
  };
  p.cfg = { sello: () => p.mio, huella: fnv, retomarSello: () => p.reclamar(), recargar: () => { p.leer(); p.reclamar(); } };
  return p;
}

let RELOJ = Date.UTC(2026, 9, 1, 15, 0, 0);
function montar(o) {
  o = o || {};
  const alm = o.alm || almacenDoble();
  /* NUBE.agregarChoques escribe por su cuenta en el localStorage global: es la
     MISMA función que usa el celular, y se prueba esa, no una copia. */
  globalThis.localStorage = alm;
  const srv = o.srv || servidor();
  const tab = o.tab || pestana(alm, o.quien || 'A');
  if (o.db) tab.guardar(o.db);
  const timers = [];
  const vent = {
    confirmar: true, modal: null, confirmes: [],
    addEventListener() {},
    confirm(m) { vent.confirmes.push(m); return vent.confirmar; },
    openModal(t, h) { vent.modal = { t, h }; },
    cerrarModal() { vent.modal = null; }
  };
  const barra = { innerHTML: '' };
  const estadoRed = { conectado: o.conectado !== false, enLinea: o.enLinea !== false };
  const C = crear({
    nube: N, almacen: alm, puente: require('../app/puente.js'),
    red: {
      conectado: () => estadoRed.conectado,
      traer: d => srv.traer(d), empujar: (d, l) => srv.empujar(d, l), sembrarContador: (k, v) => srv.sembrarContador(k, v)
    },
    ahora: () => RELOJ,
    programar: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    desprogramar() {}, cadaRato: () => 0,
    ventana: vent, documento: null, enLinea: () => estadoRed.enLinea
  });
  if (o.configurar !== false) C.configurar(Object.assign({ barra }, tab.cfg));
  return { C, alm, srv, tab, timers, vent, barra, estadoRed };
}

/* -------------------------------------------------------------- carteras */
function socio(i, extra) {
  return Object.assign({ id: 'C' + i, numero: i + 1, nombre: 'Socio ' + i, cedula: String(1000000 + i),
    telefono: '300' + String(i).padStart(7, '0'), gestiones: [{ fecha: '2026-09-10', canal: 'whatsapp', plantilla: 'r' }],
    cedulaFrenteFoto: 'data:image/jpeg;base64,AAAA' + i, selfieFoto: 'data:image/jpeg;base64,BBBB' + i,
    notaRiesgo: '', ajusteGarantia: 0, telefono2: '' }, extra || {});
}
function credito(i, s, extra) {
  return Object.assign({ id: 'P' + i, numero: i + 1, socioId: 'C' + s, socioNombre: 'Socio ' + s,
    capital: 100000 * (1 + (i % 5)), costoPct: 20, fechaDesembolso: '2026-09-15', pagado: false, fechaPagado: null, cicloActual: '2026-10-15',
    abonos: [], prorrogas: [], condonaciones: [],
    comprobantes: [{ fecha: '2026-09-20', tipo: 'abono', monto: 30000, foto: 'data:image/png;base64,ZZ' + i }] }, extra || {});
}
function cartera(nS, porSocio) {
  const db = { socios: [], prestamos: [], respaldados: [], papelera: [], papeleraSocios: [],
    config: { pin: '1234', negocio: 'Tu Garantía' }, plantillas: { a: 'hola' },
    contadores: { cliente: nS, credito: 0, respaldado: 0 },
    gestiones: [], asignaciones: [{ socio_id: 'C0', asesor_id: 'E1', desde: '2026-09-01' }], actosComision: [] };
  let k = 0;
  for (let i = 0; i < nS; i++) {
    db.socios.push(socio(i));
    for (let j = 0; j < (porSocio || 0); j++) db.prestamos.push(credito(k++, i));
  }
  db.contadores.credito = k;
  return db;
}
const leerDisco = alm => JSON.parse(alm.getItem(KEY) || '{}');
const espejoDisco = alm => JSON.parse(alm.getItem(ESPEJO) || '{}');
const estadoDisco = alm => JSON.parse(alm.getItem(ESTADO) || '{}');
function congeladas(alm) { return (estadoDisco(alm).congeladas) || {}; }

/* Empareja (con el «sí» de Joan) y deja hecha la primera subida. */
async function sembrar(m) {
  await m.C.emparejar();
  return m.C.confirmarEmparejar();
}

/* LA INVARIANTE DEL ESPEJO: para toda fila de las tres tablas, o el espejo dice
   exactamente lo que la cartera tiene (sin fotos), o la fila está congelada, o
   no está en el espejo. */
function invariante(alm, donde) {
  const db = leerDisco(alm), esp = espejoDisco(alm), cong = congeladas(alm);
  TABLAS.forEach(t => (db[CAMPO[t]] || []).forEach(f => {
    const e = esp[t] && esp[t][f.id];
    if (!e || cong[t + '|' + f.id]) return;
    assert.equal(e.json, N.jsonCanonico(N.sinFotos(f)),
      (donde || '') + ': el espejo afirma de ' + t + '/' + f.id + ' algo que la cartera no dice');
    assert.equal(!!e.borrado, false, (donde || '') + ': el espejo da por borrada una fila viva ' + f.id);
  }));
}

module.exports = {
  RAIZ, KEY, ESPEJO, SELLO, ESTADO, DUENO, TABLAS, CAMPO, clon, azar, almacenDoble, comoJsonb,
  servidor, fnv, pestana, RELOJ, montar, socio, credito, cartera, leerDisco, espejoDisco, estadoDisco,
  congeladas, sembrar, invariante
};
