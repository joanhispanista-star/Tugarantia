/* ============================================================================
 * LA CARTERA DEL EQUIPO — 10 de septiembre de 2026
 *
 *   cd pruebas && node --test
 *
 * Joan reparte clientes desde «Repartir → 🧑‍🤝‍🧑 Clientes», la asignación viajaba a
 * la nube… y la PERSONA no. equipo_publicar solo mandaba prospectos y mi_cartera
 * solo unía contra esa tabla, así que un asesor con treinta clientes de cobranza
 * asignados abría «Mi base» y leía «Todavía no te han asignado a nadie».
 *
 * Toda la mitad de COBRANZA —CA, D-3, D-2, D-1, D0, M1A, M1B, M1-2, que Joan
 * describió una por una— no existía. Nada fallaba: sencillamente no llegaba.
 *
 * LA PRUEBA QUE MÁS IMPORTA DE ESTE ARCHIVO ES LA DE PRIVACIDAD. Ahora que los
 * clientes de verdad viajan, viaja gente a la que Joan ya le prestó: con cédula,
 * dirección, fotos y saldos en su ficha. A la nube del equipo solo puede ir
 * nombre, celular y etapa. Con eso se cobra; todo lo demás multiplicaría el daño
 * el día que se pierda un celular, y la Ley 1581 pide tratar lo mínimo para la
 * finalidad, no todo lo que uno tenga a mano.
 *
 * Esa regla está escrita en la cabecera de la migración, y una regla escrita
 * solo en un comentario es una regla que alguien va a romper sin enterarse.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260910_equipo_en_la_nube.sql');

const HOY = (() => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();

/* Un cliente con TODO lo que una ficha de verdad lleva encima. */
const CLIENTE_COMPLETO = {
  id: 's1', nombre: 'Ana Torres', telefono: '3001112233', whatsappIgual: true,
  cedula: '52111222', direccion: 'Calle 45 #12-30', barrio: 'Kennedy', ciudad: 'Bogotá',
  correo: 'ana@correo.com', ingresoQuincenal: 900000, notaRiesgo: 'buen pagador',
  codigoAcceso: 'K7QP3', fotos: { frente: 'data:image/png;base64,AAA', selfie: 'data:image/png;base64,BBB' },
  vinculacion: { tipo_vivienda: 'arriendo', empresa: 'Almacén La 45' },
  referencias: [{ nombre: 'Marta', telefono: '3001110000' }]
};

function cartera(extra) {
  return Object.assign({
    socios: [CLIENTE_COMPLETO],
    prestamos: [],
    prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo' }],
    equipo: [{ id: 'a1', nombre: 'Asesor Uno', rol: 'asesor', estado: 'activo', celular: '3001110002' }],
    asignaciones: [{ id: 'A1', socio_id: 'p1', asesor_id: 'a1', desde: HOY },
                   { id: 'A2', socio_id: 's1', asesor_id: 'a1', desde: HOY }],
    gestiones: [], config: { negocio: 'Tu Garantía' }
  }, extra || {});
}

/* Corre publicarEquipo con la nube de mentira y devuelve lo que se mandó. */
function publicar(P, db) {
  P.cargarCartera(db || cartera());
  P.ev(`
    var _enviado = null, _dicho = '';
    sbListo = function () { return true; };
    sbCfg = function () { return { url: 'u', anon: 'a', clave: 'c' }; };
    confirm = function (m) { _dicho = String(m); return true; };
    alert = function (m) { _dicho += '\\n' + String(m); };
    rpc = function (fn, args) {
      if (fn === 'gestiones_listar') return Promise.resolve([]);
      if (fn === 'equipo_publicar') { _enviado = args; return Promise.resolve({ ok: true }); }
      return Promise.resolve(null);
    };
    publicarEquipo();
  `);
  return { enviado: () => P.ev('_enviado'), dicho: () => P.ev('_dicho') };
}

describe('la cartera del equipo: los clientes le llegan al asesor (10-sep-2026)', () => {

  test('DE UN CLIENTE SOLO VIAJAN NOMBRE, CELULAR Y ETAPA — nada más', async () => {
    /* El corazón de este archivo. Si alguien agrega un campo «por comodidad»,
       esta prueba se cae y le dice por qué no puede. */
    const P = abrirPanel();
    const r = publicar(P, cartera());
    await new Promise(res => setTimeout(res, 30));
    const enviado = r.enviado();
    assert.ok(enviado, 'no se llamó a equipo_publicar');
    const cli = (enviado.p_gente || []).find(x => x.id === 's1');
    assert.ok(cli, 'el cliente asignado no viajó: el asesor abriría «Mi base» y no vería a nadie');

    assert.deepEqual(Object.keys(cli).sort(),
      ['celular', 'estado', 'etapa', 'id', 'nombre', 'tipo'],
      'a la nube del equipo viaja un campo de más. Solo puede ir nombre, celular y etapa: ' +
      'con eso se cobra, y lo demás multiplica el daño el día que se pierda un celular.');

    /* Y por si alguien mete un dato sensible dentro de uno de los permitidos. */
    const plano = JSON.stringify(enviado.p_gente);
    [['la cédula', '52111222'], ['la dirección', 'Calle 45'], ['el correo', 'ana@correo.com'],
     ['una foto', 'base64'], ['la nota de riesgo', 'buen pagador'],
     ['el código de acceso', 'K7QP3'], ['el ingreso', '900000'],
     ['una referencia', '3001110000']].forEach(([que, aguja]) => {
      assert.ok(plano.indexOf(aguja) < 0, que + ' viajó a la nube del equipo');
    });
  });

  test('viajan los DOS tipos, cada uno etiquetado', async () => {
    const P = abrirPanel();
    const r = publicar(P, cartera());
    await new Promise(res => setTimeout(res, 30));
    const g = r.enviado().p_gente || [];
    assert.equal(g.length, 2, 'no viajaron los dos');
    assert.equal(g.find(x => x.id === 'p1').tipo, 'prospecto');
    assert.equal(g.find(x => x.id === 's1').tipo, 'cliente');
  });

  test('solo viaja el que alguien está trabajando', async () => {
    /* Publicar los 697 cuando hay 30 repartidos sería mandar a la nube datos de
       gente que nadie va a contactar — y datos personales que nadie pidió. */
    const P = abrirPanel();
    const db = cartera({
      prospectos: [{ id: 'p1', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo' },
                   { id: 'p2', nombre: 'Nadie Suyo', celular: '3001110099', estado: 'nuevo' }],
      socios: [CLIENTE_COMPLETO, { id: 's2', nombre: 'Sin Asesor', telefono: '3001110088', cedula: '9' }]
    });
    const r = publicar(P, db);
    await new Promise(res => setTimeout(res, 30));
    const ids = (r.enviado().p_gente || []).map(x => x.id).sort();
    assert.deepEqual(ids, ['p1', 's1'], 'viajó gente que nadie tiene asignada');
  });

  test('el aviso dice cuántos son de cobrar y cuántos de vender', async () => {
    const P = abrirPanel();
    const r = publicar(P, cartera());
    await new Promise(res => setTimeout(res, 30));
    const d = r.dicho();
    assert.match(d, /1 potenciales/, 'el aviso no cuenta los potenciales: ' + d);
    assert.match(d, /1 clientes \(para cobrarles\)/, 'el aviso no cuenta los clientes: ' + d);
    assert.match(d, /Ni cédula, ni dirección, ni fotos/,
      'el aviso no le dice a Joan qué NO viaja: es lo que le deja decidir con conocimiento');
  });

  test('del cliente viaja su número de WhatsApp, que es al que se le cobra', async () => {
    const P = abrirPanel();
    const db = cartera({ socios: [Object.assign({}, CLIENTE_COMPLETO,
      { whatsappIgual: false, whatsappNumero: '3009998877' })] });
    const r = publicar(P, db);
    await new Promise(res => setTimeout(res, 30));
    const cli = (r.enviado().p_gente || []).find(x => x.id === 's1');
    assert.equal(cli.celular, '3009998877',
      'viajó el teléfono fijo en vez del WhatsApp: el asesor no lo puede contactar');
  });

  /* ---------------------------------------------------------------------- */

  test('EL SERVIDOR BUSCA EN cartera, NO en prospectos', () => {
    /* Si mi_cartera vuelve a unir solo contra prospectos, los clientes dejan de
       llegar y no falla nada: sencillamente no aparecen. */
    const cuerpo = SQL.slice(SQL.indexOf('function public.mi_cartera'));
    assert.match(cuerpo.slice(0, 3000), /from public\.cartera p/,
      'mi_cartera no lee la tabla cartera');
    assert.ok(SQL.indexOf('public.prospectos') < 0,
      'quedó una referencia a public.prospectos: la tabla se llama cartera');
    assert.match(SQL, /'tipo', p\.tipo/,
      'mi_cartera no devuelve el tipo: la pantalla no puede separar cobrar de vender');
  });

  test('la tabla no acepta un tipo inventado', () => {
    assert.match(SQL, /check \(tipo in \('prospecto', 'cliente'\)\)/,
      'sin el check, un tipo mal escrito deja a esa persona fuera de los dos grupos');
  });

  test('renombrar el parámetro exige tirar la función primero', () => {
    /* PostgreSQL no deja renombrar un parámetro con create or replace: da
       «cannot change name of input parameter» y aborta la migración entera. */
    const i = SQL.indexOf('drop function if exists public.equipo_publicar');
    const j = SQL.indexOf('create or replace function public.equipo_publicar');
    assert.ok(i >= 0 && i < j,
      'falta el drop antes de recrear equipo_publicar con el parámetro nuevo');
  });

  test('una gestión NO le mueve la cartera de cobranza a un cliente', () => {
    /* La etapa de un cliente la calcula el motor con sus créditos. Si un «no
       contesta» se la moviera, una llamada sin respuesta borraría una mora. */
    const cuerpo = SQL.slice(SQL.indexOf('function public.gestion_anotar'));
    assert.match(cuerpo.slice(0, 2600), /update public\.cartera set estado[\s\S]{0,120}tipo = 'prospecto'/,
      'gestion_anotar le cambia el estado también a los clientes');
  });

  test('la pantalla del asesor separa los dos guiones', () => {
    /* Joan: «segmentalos, que no sean el mismo tipo de cliente». Un asesor que
       los ve revueltos llama al que debe con el guion del que no ha pedido nada. */
    assert.match(CRM, /Cobrar \(' \+ cli \+ '\)/, 'no hay grupo de cobrar');
    assert.match(CRM, /Vender \(' \+ pot \+ '\)/, 'no hay grupo de vender');
  });
});
