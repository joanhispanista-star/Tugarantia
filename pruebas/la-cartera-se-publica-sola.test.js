'use strict';
/* ============================================================================
 * LA CARTERA DEL EQUIPO SE PUBLICA SOLA — 15 de octubre de 2026
 *
 *   node --test pruebas/la-cartera-se-publica-sola.test.js
 *
 * Joan quiere que su gerente cobre. Para cobrar, el gerente necesita la cifra
 * y la fecha de cada cliente, y eso viaja solo cuando se publica: es una FOTO
 * del cálculo del día. Ahora se publica sola mientras el CRM de Joan está
 * abierto (publicarEquipoSolo en panel/crm.html).
 *
 * Lo que se vigila es lo que hace PELIGROSO publicar sin preguntar:
 *   · que un CRM que no es el de Joan —otro computador, una pestaña con la
 *     cartera vieja— publique montos viejos con la fecha de hoy;
 *   · que publique sin haber traído lo que hizo el gerente, y se lo pise;
 *   · que salte un cuadro cada quince minutos;
 *   · y que mande algo distinto de lo que manda la publicación a mano.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const espera = () => new Promise(r => setTimeout(r, 40));

function cartera() {
  return {
    socios: [{ id: 's1', nombre: 'Ana Torres', telefono: '3001112233', whatsappIgual: true }],
    prestamos: [],
    prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo' }],
    equipo: [{ id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: '3000000000' }],
    asignaciones: [{ id: 'A1', socio_id: 'p1', asesor_id: 'g1', desde: HOY },
                   { id: 'A2', socio_id: 's1', asesor_id: 'g1', desde: HOY }],
    gestiones: [], config: { negocio: 'Tu Garantía' }
  };
}

/* El CRM de Joan con la nube de mentira. `fase` es lo que dice la subida de
   la cartera (nube-crm.js): 'lista' es «este computador está emparejado». */
function abrir(opciones) {
  const o = Object.assign({ fase: 'lista', traer: 'bien' }, opciones || {});
  const P = abrirPanel();
  P.cargarCartera(cartera());
  P.ev(`
    var _enviados = [], _cuadros = [];
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _cuadros.push(String(m)); return true; };
    alert = function (m) { _cuadros.push(String(m)); };
    estoyOcupado = function () { return false; };
    _carteraAjena = function () { return ${o.ajena ? 'true' : 'false'}; };
    /* 23-oct-2026 — la de 15 min pregunta además si la cartera está al día
       con la nube (libroAlDiaEsperando): aquí lo está. */
    window.NubeCRM = { estado: function () { return { fase: ${JSON.stringify(o.fase)} }; }, libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } };
    rpc = function (fn, args) {
      if (fn === 'equipo_traer' || fn === 'gestiones_listar') {
        return ${o.traer === 'falla' ? "Promise.reject({ motivo: 'sin señal' })" : "Promise.resolve(fn === 'gestiones_listar' ? [] : {})"};
      }
      if (fn === 'equipo_publicar') { _enviados.push(args); return Promise.resolve({ ok: true }); }
      return Promise.resolve(null);
    };
  `);
  return P;
}

describe('la cartera del equipo se publica sola', () => {

  test('PUBLICA CUANDO ESTE COMPUTADOR ESTÁ EMPAREJADO, sin un solo cuadro', async () => {
    const P = abrir();
    const r = P.ev('publicarEquipoSolo()');
    await espera();
    assert.equal(await r, 'publicado');
    assert.equal(P.ev('_enviados.length'), 1, 'no publicó');
    assert.equal(P.ev('_cuadros.length'), 0, 'saltó un cuadro: la publicación sola no puede preguntar ni avisar con alert');
    assert.equal(P.ev('leerPublicadoSolo().ok'), true);
  });

  test('NO PUBLICA SI ESTE COMPUTADOR NO ESTÁ EMPAREJADO: los montos podrían ser viejos', async () => {
    for (const fase of ['falta-emparejar', 'sin-conectar', 'cartera-ilegible', 'revisando']) {
      const P = abrir({ fase });
      assert.equal(await P.ev('publicarEquipoSolo()'), 'sin_emparejar', fase);
      assert.equal(P.ev('_enviados.length'), 0, 'publicó con la subida en «' + fase + '»');
    }
    const sinModulo = abrir();
    sinModulo.ev('window.NubeCRM = undefined;');
    assert.equal(await sinModulo.ev('publicarEquipoSolo()'), 'sin_emparejar', 'sin nube-crm.js no se sabe si está emparejado');
  });

  test('NO PUBLICA CON LA CARTERA ESCRITA POR OTRA PESTAÑA, ni en modo equipo', async () => {
    const P = abrir({ ajena: true });
    assert.equal(await P.ev('publicarEquipoSolo()'), 'cartera_ajena');
    assert.equal(P.ev('_enviados.length'), 0);
    const Q = abrir();
    Q.ev("CARTERA_EQUIPO = { ok: true, yo: { rol: 'gerente', celular: '3000000000', nombre: 'W' }, gente: [] };");
    assert.equal(await Q.ev('publicarEquipoSolo()'), 'modo_equipo', 'el celular del gerente publicaría la cartera vacía');
    assert.equal(Q.ev('_enviados.length'), 0);
  });

  test('SI NO PUEDE TRAER LO DEL EQUIPO, NO PUBLICA (y no pregunta)', async () => {
    const P = abrir({ traer: 'falla' });
    const r = P.ev('publicarEquipoSolo()');
    await espera();
    assert.equal(await r, 'fallo');
    assert.equal(P.ev('_enviados.length'), 0, 'publicó sin traer: le pisaría al gerente lo que hizo');
    assert.equal(P.ev('_cuadros.length'), 0, 'preguntó: la sola no tiene a quién preguntar');
    assert.equal(P.ev('leerPublicadoSolo().ok'), false, 'el fallo no quedó anotado para la línea de Equipo');
  });

  test('NO VUELVE A MANDAR LO MISMO EL MISMO DÍA; sí si algo cambió', async () => {
    const P = abrir();
    await P.ev('publicarEquipoSolo()'); await espera();
    assert.equal(await P.ev('publicarEquipoSolo()'), 'sin_cambios');
    assert.equal(P.ev('_enviados.length'), 1);
    P.ev("DB.prospectos.push({ id: 'p2', nombre: 'Nueva', celular: '3001110009', estado: 'nuevo' });" +
         "DB.asignaciones.push({ id: 'A3', socio_id: 'p2', asesor_id: 'g1', desde: '" + HOY + "' });");
    await P.ev('publicarEquipoSolo()'); await espera();
    assert.equal(P.ev('_enviados.length'), 2, 'una asignación nueva no se publicó');
    /* Y si cambió el día, aunque nada más cambie: la mora mueve los montos. */
    P.ev("anotarPublicadoSolo(Object.assign(leerPublicadoSolo(), { dia: '2000-01-01' }));");
    await P.ev('publicarEquipoSolo()'); await espera();
    assert.equal(P.ev('_enviados.length'), 3, 'un día nuevo no se publicó: el gerente cobraría el monto de ayer');
  });

  test('MANDA EXACTAMENTE LO MISMO QUE LA PUBLICACIÓN A MANO', async () => {
    const A = abrir();
    await A.ev('publicarEquipoSolo()'); await espera();
    const B = abrir();
    B.ev('publicarEquipo()'); await espera();
    const sola = A.ev('JSON.stringify(_enviados[0])'), aMano = B.ev('JSON.stringify(_enviados[0])');
    assert.ok(sola && aMano, 'alguna de las dos no publicó');
    assert.equal(sola, aMano, 'la sola y la de a mano mandan cosas distintas');
    assert.ok(B.ev('_cuadros.length') >= 1, 'la de a mano dejó de preguntar antes de publicar');
  });

  test('arranca después del PIN, nunca en modo equipo, y la pestaña Equipo dice lo que pasó', () => {
    assert.match(CRM, /try\{ if\(!CARTERA_EQUIPO\) arrancarPublicarSolo\(\); \}catch\(e\)\{\}/);
    assert.match(CRM, /<div id="equipoPublicadoSolo"/);
    const P = abrir({ fase: 'falta-emparejar' });
    P.ev('pintarPublicadoSolo("sin_emparejar")');
    assert.match(P.elems.equipoPublicadoSolo.innerHTML, /emparejar/);
    /* Las dos de traer solo dejan de preguntar en 'auto'. */
    assert.match(CRM, /if \(callado === 'auto'\) throw e;\s*\n\s*if \(!callado\) alert\('No pude traer el equipo/);
    assert.match(CRM, /if \(callado === 'auto'\) throw e;   \/\/ la que corre sola no publica sin traer/);
  });
});
