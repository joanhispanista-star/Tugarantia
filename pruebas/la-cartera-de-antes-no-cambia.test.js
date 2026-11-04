/* ===========================================================================
 * LA CARTERA DE ANTES ABRE CON EL CÓDIGO NUEVO SIN CAMBIAR NI UN PESO — E1, 4-nov-2026
 *
 *   node --test pruebas/la-cartera-de-antes-no-cambia.test.js
 *
 * La cartera real de Joan vive en el Chrome de su computador, escrita por la app de
 * hasta v142: abonos sin id, fichas con punteros y con fotos de verdad. Lo que este lote
 * no puede hacer es tocarla. Aquí, con una cartera grande inventada (cartera-grande.js):
 *
 *   · abrirla no le cambia nada: ni un abono, ni una foto, ni la cuenta de un crédito;
 *   · ir y volver por la nube tampoco: lo que sube no lleva una imagen, y al aplicar lo
 *     que baja cada ficha recupera las suyas;
 *   · la cura hace subir una vez las fichas con fotos, y solo esas, y solo una vez;
 *   · juntar una ficha consigo misma no le cambia la plata.
 *
 * La comparación con el código de antes en un Chrome de verdad vive fuera del
 * repositorio. Esta es la que se queda vigilando.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const N = require('../panel/nube.js');
const { abrirPanel } = require('./banco-panel.js');
const { carteraGrande, cuentaDeCredito } = require('./cartera-grande.js');

const clon = v => JSON.parse(JSON.stringify(v));
const RAIZ = path.join(__dirname, '..');
const KEY = 'joan_socios_v1';
const FECHA = '2026-11-04', HOY = FECHA + 'T15:00:00';
const CAMPOS = ['cedulaFrenteFoto', 'cedulaReversoFoto', 'selfieFoto', 'cedulaFoto'];
const DB = carteraGrande({ socios: 150 });
const cuentas = db => db.prestamos.map(p => [p.id, cuentaDeCredito(p, FECHA)]);
const conFoto = s => CAMPOS.some(k => !!s[k]);

/* El nube.js de v142, para sembrar el espejo que Joan tiene el día que se publique esto. */
function nubeDeAntes() {
  let fuente;
  try { fuente = execFileSync('git', ['show', 'ee7c3cc:panel/nube.js'], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) { return null; }
  const mod = { exports: {} };
  vm.runInNewContext(fuente, { module: mod, globalThis: {} });
  return mod.exports;
}

describe('la maqueta tiene de todo: si no, el verde no mediría nada', () => {
  test('abonos sin id, gemelos, punteros, fotos, cuotas, pactos, pérdidas y recibos', () => {
    const abonos = DB.prestamos.flatMap(p => p.abonosCapital);
    assert.ok(abonos.length > 50 && abonos.every(a => !a.id), 'tiene que haber abonos, y todos de antes');
    assert.ok(DB.prestamos.some(p => { const k = p.abonosCapital.map(a => a.fecha + a.monto); return new Set(k).size < k.length; }), 'faltan dos abonos iguales en un crédito');
    assert.ok(DB.socios.some(s => String(s.selfieFoto).startsWith('foto:reg:')), 'faltan punteros');
    assert.ok(DB.socios.some(s => String(s.selfieFoto).startsWith('data:')), 'faltan fotos de verdad');
    assert.ok(DB.prestamos.some(p => p.planPagos && p.planPagos.pacto), 'faltan pagos acordados');
    assert.ok(DB.prestamos.some(p => p.planPagos && !p.planPagos.pacto), 'faltan créditos a cuotas');
    assert.ok(DB.prestamos.some(p => Number(p.capitalPerdido) > 0), 'faltan cierres con pérdida');
    assert.ok(DB.respaldados.some(r => r.cuotas.some(c => c.comprobante)), 'faltan recibos de cuota');
  });
});

describe('abrirla con el código nuevo no le cambia nada', () => {
  const almacen = { [KEY]: JSON.stringify(DB) };
  const C = abrirPanel({ almacen, ahora: HOY, tarjeta: true });
  const enLaPagina = () => JSON.parse(C.ev('JSON.stringify(DB)'));

  test('la puerta es la del PIN, y entra con el suyo', () => {
    assert.equal(C.elems.gateSinCartera.hidden, true, 'le dijo a Joan que no tiene cartera');
    C.ev("document.getElementById('pinInput').value = '482915'; entrar()");
    assert.equal(C.ev('_crmAbierto'), true);
    assert.equal(C.ev('_otraPestana'), null);
  });

  test('cada crédito da la misma cuenta, abono por abono', () => {
    assert.deepEqual(cuentas(enLaPagina()), cuentas(DB));
  });

  test('ninguna ficha pierde una foto, y el cupo no se mueve', () => {
    const d = enLaPagina();
    d.socios.forEach((s, i) => CAMPOS.forEach(k => {
      if (DB.socios[i][k]) assert.equal(s[k], DB.socios[i][k], s.id + ' perdió ' + k);
    }));
  });

  test('ningún comprobante ni recibo pierde lo suyo', () => {
    const d = enLaPagina();
    assert.deepEqual(d.prestamos.map(p => p.comprobantes), DB.prestamos.map(p => p.comprobantes));
    assert.deepEqual(d.respaldados.map(r => r.cuotas), DB.respaldados.map(r => r.cuotas));
  });

  test('guardar y volver a abrir tampoco: el disco queda con lo mismo', () => {
    assert.equal(C.ev('guardar()'), true);
    const disco = JSON.parse(almacen[KEY]);
    assert.deepEqual(cuentas(disco), cuentas(DB));
    assert.equal(disco.config.pin, '482915');
    assert.deepEqual(disco.prestamos.flatMap(p => p.abonosCapital), DB.prestamos.flatMap(p => p.abonosCapital), 'un abono de antes cambió');
    const Q = abrirPanel({ almacen, ahora: HOY });
    assert.deepEqual(cuentas(JSON.parse(Q.ev('JSON.stringify(DB)'))), cuentas(DB));
  });

  test('ningún abono de antes ganó un id', () => {
    assert.ok(enLaPagina().prestamos.flatMap(p => p.abonosCapital).every(a => !('id' in a)));
  });
});

describe('ida y vuelta por la nube', () => {
  const lote = N.armarLote(DB, N.espejoVacio(), { sinPapelera: true });
  const paquete = N.paqueteDeLote(lote, { completo: true });

  test('lo que sube no lleva ni una imagen ni el PIN', () => {
    const t = JSON.stringify(lote);
    assert.ok(t.indexOf('base64') < 0, 'se coló una imagen en lo que sale por la red');
    assert.ok(t.indexOf('482915') < 0, 'el PIN salió por la red');
    assert.ok(t.indexOf('2026-11-01') >= 0 ? !/ultimoRespaldo/.test(t) : true, 'la fecha del respaldo salió por la red');
  });

  test('en el otro aparato el cupo y la cuenta de cada crédito son los mismos', () => {
    const alla = N.aplicarPaquete(null, paquete).db;
    assert.deepEqual(cuentas(alla), cuentas(DB));
  });

  test('al aplicar lo que baja, cada ficha recupera sus fotos, sus comprobantes y sus recibos', () => {
    const porId = l => Object.fromEntries(l.map(x => [x.id, x]));
    const loc = { socios: porId(DB.socios), creditos: porId(DB.prestamos), respaldados: porId(DB.respaldados) };
    ['socios', 'creditos', 'respaldados'].forEach(t => paquete[t].forEach(f => {
      const vuelta = N.devolverFotos(f.datos, loc[t][f.id]);
      /* Dos comprobantes iguales, uno con foto y otro sin: la foto vuelve al primero
         que le sirve. Es la misma foto en el mismo crédito, con el mismo monto. */
      const ordenar = d => Object.assign({}, d, d.comprobantes ? { comprobantes: d.comprobantes.map(c => N.jsonCanonico(c)).sort() } : {});
      assert.equal(N.jsonCanonico(ordenar(vuelta)), N.jsonCanonico(ordenar(loc[t][f.id])), t + '/' + f.id + ' no volvió igual');
    }));
  });

  test('juntar una ficha con lo que ella misma subió no le cambia la plata', () => {
    /* Un choque de nada, con gemelos de antes adentro: dos abonos iguales del mismo día. */
    const porId = Object.fromEntries(paquete.creditos.map(f => [f.id, f.datos]));
    DB.prestamos.forEach(p => {
      const r = N.fusionarFila(N.sinFotos(p), porId[p.id], N.LISTAS_QUE_SUMAN);
      assert.equal(r.hayChoque, false, p.id + ' salió de choque consigo misma');
      assert.equal(JSON.stringify(r.fila.abonosCapital.map(a => a.monto).sort()), JSON.stringify(p.abonosCapital.map(a => a.monto).sort()), p.id + ' perdió un abono al juntarse');
      assert.equal(r.fila.comprobantes.length, p.comprobantes.length, p.id + ' perdió un comprobante al juntarse');
    });
  });
});

describe('el día que se publique: lo que resube el computador', () => {
  const V = nubeDeAntes();
  const espejoDeAntes = () => {
    const e = N.espejoVacio();
    ['socios', 'prestamos', 'respaldados'].forEach(c => {
      const t = c === 'prestamos' ? 'creditos' : c;
      DB[c].forEach(f => { e[t][f.id] = { revision: 5, json: N.jsonCanonico((V || N).sinFotos(f)) }; });
    });
    return e;
  };

  test('suben las fichas con fotos, una vez, y ni una más', { skip: V ? false : 'sin la historia no hay nube.js de v142' }, () => {
    const e = espejoDeAntes();
    const lote = N.armarLote(DB, e, { claves: [] });
    const conFotos = DB.socios.filter(conFoto).map(s => s.id).sort();
    assert.deepEqual(lote.socios.map(f => f.id).sort(), conFotos, 'subió una ficha sin fotos, o se quedó una con fotos');
    assert.equal(lote.creditos.length, 0, 'un crédito no tiene por qué resubir: sus fotos no cambian de forma');
    assert.equal(lote.respaldados.length, 0);
    assert.ok(lote.socios.every(f => f.revision_base === 5 && !f.borrado));
    const tras = N.espejoTrasEmpujar(e, lote, { revisiones: lote.socios.map(f => ({ tabla: 'socios', id: f.id, revision: 6 })), choques: [] });
    const otra = N.armarLote(DB, tras, { claves: [] });
    assert.equal(otra.socios.length + otra.creditos.length + otra.respaldados.length, 0, 'sigue subiendo en cada vuelta');
  });

  test('nada de eso se manda borrado, y emparejar con la nube de antes no congela nada', { skip: V ? false : 'sin la historia' }, () => {
    const paq = { completo: true, socios: DB.socios.map(s => ({ id: s.id, datos: V.sinFotos(s), revision: 5, borrado: false })),
      creditos: DB.prestamos.map(p => ({ id: p.id, datos: V.sinFotos(p), revision: 5, borrado: false })),
      respaldados: DB.respaldados.map(r => ({ id: r.id, datos: V.sinFotos(r), revision: 5, borrado: false })), ajustes: [] };
    const r = N.espejoDeAdopcion(DB, paq, null);
    assert.deepEqual(r.congelar, [], 'emparejar puso fichas en discusión solo por sus fotos');
    assert.deepEqual(r.soloAlla, []);
    assert.deepEqual(r.soloAca, []);
  });

  test('el nube.js de antes con una fila nueva, por una pestaña vieja: no se le pierde la plata', { skip: V ? false : 'sin la historia' }, () => {
    /* Una página vieja abierta, con su nube.js de antes, recibe lo que subió la nueva. */
    const paquete = N.paqueteDeLote(N.armarLote(DB, N.espejoVacio(), { sinPapelera: true }), { completo: true });
    const alla = clon(V.aplicarPaquete(null, clon(paquete)).db);
    assert.deepEqual(cuentas(alla), cuentas(DB));
  });
});
