'use strict';
/* ============================================================================
 * EL GERENTE VENDE: LO QUE DICE LA PANTALLA — 15 de octubre de 2026
 *
 *   node --test pruebas/el-gerente-vende.test.js
 *
 * Joan: «quiero que [Willian] inicie vendiendo créditos y que pueda ver los
 * nuevos registros pero únicamente de los clientes que tenemos como
 * prospectos y no todos, solo los que yo le asigne, y que él pueda hacer la
 * venta y la cobranza».
 *
 * Qué ve y qué puede lo decide la base (pruebas/el-gerente-vende-postgres.test.js).
 * Aquí se vigila que la PANTALLA diga lo mismo que la base: si el formulario
 * calculara otro total, o dejara mandar lo que la base rechaza, el gerente le
 * prometería al cliente una cifra que después no existe. Y que lo de Joan
 * —los topes y el 👤 de Registrados— esté donde él lo va a buscar.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const GV = require('../panel/gerente-vende.js');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RAIZ, 'base', '20261015_el_gerente_vende.sql'), 'utf8');
const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
const TOPES = { capital_max: 500000, costo_min: 10, costo_max: 20, dias_max: 30 };

/* El cuerpo de una función SQL, de su `create` al `$$;` que la cierra. */
const cuerpoSQL = nombre => {
  const i = SQL.indexOf('create or replace function public.' + nombre + '(');
  assert.ok(i >= 0, 'no encontré ' + nombre + ' en la migración');
  return SQL.slice(i, SQL.indexOf('\n$$;', i));
};

describe('las reglas de la pantalla son las de la base', () => {

  test('EL TOTAL SE CALCULA IGUAL QUE contrapropuesta_de: round(capital × pct / 100)', () => {
    assert.deepEqual(GV.calcular(250000, 20), { capital: 250000, costo_pct: 20, costo: 50000, total: 300000 });
    /* Los medios: PostgreSQL redondea 1234,5 hacia arriba, y la pantalla también. */
    assert.equal(GV.calcular(12345, 10).costo, 1235);
    assert.equal(GV.calcular(333333, 17).costo, 56667);
    /* Y la regla de la base sigue siendo esa: si alguien la cambia allá, esta
       prueba tiene que cambiar con ella. */
    const base = fs.readFileSync(path.join(RAIZ, 'base', '20260908_primer_credito.sql'), 'utf8');
    assert.match(base, /'costo',\s+round\(p_capital \* p_pct \/ 100\.0\)::bigint/);
    assert.match(cuerpoSQL('gerente_proponer'), /public\.contrapropuesta_de\(p_capital, p_costo_pct, p_dias/,
      'la propuesta del gerente ya no sale de la misma función que la de Joan');
  });

  test('LOS TOPES: la pantalla dice que no a lo mismo que la base', () => {
    assert.equal(GV.validar({ capital: 300000, costo_pct: 20, dias: 15 }, TOPES).ok, true);
    assert.equal(GV.validar({ capital: 500000, costo_pct: 10, dias: 30 }, TOPES).ok, true, 'los bordes valen');
    [[{ capital: 500001, costo_pct: 20, dias: 15 }, 'capital'],
     [{ capital: 9999, costo_pct: 20, dias: 15 }, 'capital'],
     [{ capital: 300000, costo_pct: 21, dias: 15 }, 'costo'],
     [{ capital: 300000, costo_pct: 9, dias: 15 }, 'costo'],
     [{ capital: 300000, costo_pct: 20, dias: 31 }, 'dias'],
     [{ capital: 300000, costo_pct: 20, dias: 0 }, 'dias'],
     [{ capital: 300000.5, costo_pct: 20, dias: 15 }, 'capital'],
     [{ capital: NaN, costo_pct: 20, dias: 15 }, 'capital']]
      .forEach(([v, m]) => {
        const r = GV.validar(v, TOPES);
        assert.equal(r.ok, false, JSON.stringify(v) + ' pasó y la base lo rechaza');
        assert.equal(r.motivo, m, JSON.stringify(v));
        assert.ok(r.texto.length > 10, 'un «no» sin palabras');
      });
    assert.equal(GV.validar({ capital: 300000, costo_pct: 20, dias: 15 }, null).motivo, 'sin_topes',
      'sin topes la pantalla dejaría mandar algo que la base cierra');
    /* Las mismas comparaciones, en la base. */
    const p = cuerpoSQL('gerente_proponer');
    ['p_capital > tp.capital_max', 'p_costo_pct < tp.costo_min', 'p_costo_pct > tp.costo_max', 'p_dias > tp.dias_max', 'p_capital < 10000']
      .forEach(x => assert.ok(p.includes(x), 'la base ya no compara ' + x));
  });

  test('PROPONER SOLO DONDE LA BASE DEJA: nueva o contrapropuesta, nunca una aceptada', () => {
    assert.equal(GV.estadoSolicitud({ estado: 'nueva' }).puedeProponer, true);
    assert.equal(GV.estadoSolicitud({ estado: 'contrapropuesta', contrapropuesta: { por: 'joan' } }).puedeProponer, true);
    ['aceptada', 'atendida', 'descartada', 'rara'].forEach(e =>
      assert.equal(GV.estadoSolicitud({ estado: e }).puedeProponer, false, e + ' deja proponer'));
    assert.equal(GV.estadoSolicitud(null).puedeProponer, false);
    assert.match(GV.estadoSolicitud({ estado: 'aceptada' }).etiqueta, /Joan desembolsar/,
      'una aceptada tiene que decir que el siguiente paso es de Joan');
    assert.match(cuerpoSQL('gerente_proponer'), /s\.estado not in \('nueva', 'contrapropuesta'\)/,
      'la base cambió qué solicitudes se pueden proponer y la pantalla no');
  });

  test('CADA «NO» DE LA BASE TIENE PALABRAS', () => {
    /* Se leen de la migración los motivos que devuelven las tres funciones del
       gerente: si la base estrena uno, esta prueba falla hasta que se nombre. */
    const motivos = new Set();
    ['gerente_registros', 'gerente_archivos', 'gerente_proponer'].forEach(f => {
      for (const m of cuerpoSQL(f).matchAll(/'motivo', '([a-z_]+)'/g)) motivos.add(m[1]);
    });
    assert.ok(motivos.size >= 5, 'no encontré los motivos en la migración');
    motivos.forEach(m => assert.ok(GV.MOTIVOS[m], 'la base contesta «' + m + '» y la pantalla no sabe decirlo'));
    assert.match(GV.textoMotivo('otro_que_no_existe'), /otro_que_no_existe/);
  });

  test('quién propuso, con su nombre', () => {
    assert.equal(GV.quienPropuso({ por: 'gerente:3000000000', por_nombre: 'WILLIAN' }), 'WILLIAN');
    assert.equal(GV.quienPropuso({ por: 'gerente:3000000000' }), 'el gerente');
    assert.equal(GV.quienPropuso({ por: 'joan' }), 'Joan');
    assert.match(cuerpoSQL('gerente_proponer'), /'por_nombre', yo\.nombre/);
  });
});

/* ----------------------------------------------------------------------------
 * LA PANTALLA DEL GERENTE, pintada de verdad con el banco del CRM.
 * ------------------------------------------------------------------------- */
const ahora = new Date().toISOString();
const REGISTROS = [
  { id: 1, nombre: 'María Gómez', telefono: '3101500001', cedula: '1010', por: 'base', asesor: '3000000000',
    asesor_nombre: 'WILLIAN', creado_en: ahora, datos: {}, huella: null,
    solicitudes: [{ id: 11, estado: 'nueva', creada_en: ahora, pedido_monto: 400000, pedido: { dias: 20 } }] },
  { id: 2, nombre: 'Carlos Ruiz', telefono: '3101500002', cedula: '2020', por: 'asignado', asesor: '3000000002',
    asesor_nombre: 'LEIDY', creado_en: ahora, datos: {}, huella: null,
    solicitudes: [{ id: 12, estado: 'aceptada', creada_en: ahora,
      contrapropuesta: { capital: 250000, total: 300000, fecha_pago: '2026-11-01', por: 'gerente:3000000000', por_nombre: 'WILLIAN' } }] },
  { id: 3, nombre: 'Luz Torres', telefono: '3101500003', cedula: '3030', por: 'base', asesor: '3000000000',
    asesor_nombre: 'WILLIAN', creado_en: ahora, datos: {}, huella: null, solicitudes: [] }
];
function abrirGerenteRegistros(reg, opciones) {
  const P = abrirPanel(Object.assign({ red: () => Promise.reject(new Error('sin red')) }, opciones || {}));
  P.ev('CARTERA_EQUIPO = ' + JSON.stringify({ ok: true, yo: { nombre: 'WILLIAN', rol: 'gerente', celular: '3000000000' },
    equipo: [{ celular: '3000000002', nombre: 'LEIDY', rol: 'asesor' }], gente: [] }) + ';');
  P.ev('VISTA_EQUIPO = "registros"; REG_EQ = ' + JSON.stringify(reg) + ';');
  return P;
}

describe('la pestaña «Registros» del gerente', () => {

  test('primero los que esperan respuesta, y «Proponer» solo donde se puede', () => {
    const P = abrirGerenteRegistros({ estado: 'ok', registros: REGISTROS, topes: TOPES, motivo: '' });
    const h = P.ev('vistaRegistrosEq()');
    const iEspera = h.indexOf('Esperan respuesta'), iDemas = h.indexOf('Los demás');
    assert.ok(iEspera > 0 && iDemas > iEspera, 'los que esperan respuesta no van primero');
    assert.ok(h.indexOf('María Gómez') > iEspera && h.indexOf('María Gómez') < iDemas, 'la que pidió no está arriba');
    assert.equal((h.match(/onclick="proponerEq\(/g) || []).length, 1,
      'hay «Proponer» donde la base no deja (una aceptada) o falta donde sí');
    assert.match(h, /proponerEq\(11\)/);
    assert.match(h, /Pidió <b>\$400\.000<\/b> a 20 días/);
    assert.match(h, /Aceptó: le toca a Joan desembolsar/);
    assert.match(h, /Te lo asignó Joan/);
    assert.match(h, /🚶 LEIDY/, 'no dice que es de la base de su asesora');
    assert.match(h, /Puedes proponer hasta <b>\$500\.000<\/b>/, 'no dice los topes');
  });

  test('sin topes lo dice, y no ofrece un formulario que la base va a rechazar', () => {
    const P = abrirGerenteRegistros({ estado: 'ok', registros: REGISTROS, topes: null, motivo: '' });
    const h = P.ev('vistaRegistrosEq()');
    assert.match(h, /todavía no te puso topes/);
    const alertas = [];
    P.ctx.alert = m => alertas.push(m);
    P.ev('proponerEq(11)');
    assert.match(alertas.join(' '), /todavía no te puso topes/, 'abrió el formulario sin topes');
  });

  test('cada estado se dice: apagado, sesión, error, vacío, y el archivo que falta', () => {
    const con = (reg, o) => abrirGerenteRegistros(reg, o).ev('vistaRegistrosEq()');
    assert.match(con({ estado: 'apagado', registros: [], topes: null }), /todavía no está encendida/);
    assert.match(con({ estado: 'sesion', registros: [], topes: null }), /sesión se venció/);
    assert.match(con({ estado: 'error', registros: [], topes: null }), /no.{0,10} quiere decir que no haya/);
    assert.match(con({ estado: 'ok', registros: [], topes: TOPES }), /Nadie de tu base se ha registrado todavía/);
    assert.match(con({ estado: 'no', registros: [], topes: null, motivo: 'solo_gerente' }), /solo para el gerente/);
    assert.match(con({ estado: 'ok', registros: REGISTROS, topes: TOPES }, { sinGerenteVende: true }),
      /Falta un archivo nuevo \(panel\/gerente-vende\.js\)/, 'sin el archivo la pestaña se cae en vez de decirlo');
  });

  test('el formulario arranca DENTRO de los topes, aunque el cliente haya pedido más', () => {
    const P = abrirGerenteRegistros({ estado: 'ok', registros: [Object.assign({}, REGISTROS[0], {
      solicitudes: [{ id: 11, estado: 'nueva', creada_en: ahora, pedido_monto: 2000000, pedido: { dias: 45 } }] })],
      topes: TOPES, motivo: '' });
    P.ev('proponerEq(11)');
    const html = P.elems.mBody.innerHTML;
    assert.match(html, /id="propEqCap" value="500000"/, 'arrancó por encima del monto máximo');
    assert.match(html, /id="propEqDias" value="30"/, 'arrancó por encima de los días máximos');
    assert.match(html, /id="propEqPct" value="20"/);
    assert.match(html, /Tú no mueves plata/, 'no dice que el desembolso es de Joan');
  });

  test('las fotos pasan por fotoSegura y avisa que queda anotado', () => {
    const i = CRM.indexOf('function verRegistroEq');
    const cuerpo = CRM.slice(i, CRM.indexOf('\nfunction ', i + 10));
    assert.match(cuerpo, /fotoSegura\(j\.fotos\[k\]\)/, 'una foto de la nube llega a un <img> sin pasar por fotoSegura');
    assert.match(cuerpo, /Queda anotado que abriste/);
  });

  test('el menú: «Registros» solo para el gerente', () => {
    assert.match(CRM, /\$\{yo\.rol === 'gerente' \? '<button class="navbtn" onclick="irEquipo\(\\'registros\\'\)"><span class="ic">📥<\/span> Registros<\/button>' : ''\}/,
      'la pestaña no está, o la ve también el asesor');
    assert.match(CRM, /registros: 'Registros'/, 'el menú no se enciende al abrir la pestaña (TITULO_EQ)');
    assert.match(CRM, /v === 'registros' \? vistaRegistrosEq\(\)/);
  });

  test('LAS FILAS DEL EQUIPO YA NO SE DESBORDAN EN EL CELULAR', () => {
    /* Visto el 15-oct en la vista de Willian: la frase de la etapa empujaba la
       fila y los botones quedaban fuera de la pantalla. */
    assert.match(CRM, /\.wrapEq \.info-row\{flex-wrap:wrap\}/);
    assert.match(CRM, /\.wrapEq \.info-row \.k\{flex:1 1 220px;min-width:0;overflow-wrap:anywhere\}/);
    assert.match(CRM, /@media \(max-width:560px\)\{ \.wrapEq \.info-row \.vv\{flex:1 1 100%/);
  });
});

describe('lo de Joan', () => {

  test('📥 Registrados dice quién ve a cada uno', () => {
    const P = abrirPanel({ red: () => Promise.reject(new Error('sin red')) });
    P.ev('_quienVe = ' + JSON.stringify({
      '3101500001': { telefono: '3101500001', por: 'base', rol: 'gerente', asesor_nombre: 'WILLIAN', gerente_nombre: 'WILLIAN' },
      '3101500002': { telefono: '3101500002', por: 'base', rol: 'asesor', asesor_nombre: 'LEIDY', gerente_nombre: 'WILLIAN' },
      '3101500004': { telefono: '3101500004', por: 'base', rol: 'asesor', asesor_nombre: 'PEDRO', gerente_nombre: null },
      '3101500005': { telefono: '3101500005', por: 'asignado', rol: 'gerente', asesor_nombre: 'WILLIAN', gerente_nombre: 'WILLIAN' }
    }) + ';');
    assert.match(P.ev("chipQuienVe({telefono:'+57 310 150 0001'})"), /Lo ve WILLIAN · es de su base/);
    assert.match(P.ev("chipQuienVe({telefono:'3101500002'})"), /Lo ve WILLIAN · es de su base \(de LEIDY\)/);
    assert.match(P.ev("chipQuienVe({telefono:'3101500004'})"), /ningún gerente lo ve/,
      'uno de un asesor sin gerente aparecería como si alguien lo viera');
    assert.match(P.ev("chipQuienVe({telefono:'3101500005'})"), /se lo asignaste/);
    assert.equal(P.ev("chipQuienVe({telefono:'3109999999'})"), '');
  });

  test('el 👤 está en cada fila de Registrados, y sin la migración lo dice', () => {
    /* 27-oct-2026 — el botón lleva SOLO los dígitos del celular: el nombre lo
       busca asignarRegistro en la bandeja (pruebas/ningun-nombre-se-ejecuta.test.js). */
    assert.match(CRM, /onclick="asignarRegistro\('\$\{digitosDeBoton\(r\.telefono\)\}'\)"/,
      'falta el botón de asignar en la fila, o se rompió la expresión del celular');
    /* 27-oct-2026 — detrás, el «lo subió tu equipo» (el gerente agrega). */
    assert.match(CRM, /\$\{chipQuienVe\(r\)\}\$\{chipEquipoRegistro\(r\)\}<\/td>/);
    const P = abrirPanel({ red: () => Promise.reject(new Error('sin red')) });
    const alertas = []; P.ctx.alert = m => alertas.push(m);
    P.ev('_quienVeFalta = true; asignarRegistro("3101500001", "María")');
    assert.match(alertas.join(' '), /20261015_el_gerente_vende\.sql/);
  });

  test('los topes están en Ajustes y se cargan al pintarlos', () => {
    ['cfgTopeCap', 'cfgTopePctMin', 'cfgTopePctMax', 'cfgTopeDias', 'cfgTopeEstado'].forEach(id =>
      assert.match(CRM, new RegExp('id="' + id + '"'), 'falta ' + id + ' en Ajustes'));
    assert.match(CRM, /pintarFreno\(\); cargarPoliticaNuevos\(\); cargarTopesEquipo\(\); \}/,
      'los topes no se leen al abrir Ajustes');
    assert.match(CRM, /rpc\('topes_equipo_guardar',\{p_clave:sbCfg\(\)\.clave,p_capital_max:0/,
      'no hay forma de quitarle los topes');
  });

  test('la bandeja dice el NOMBRE del gerente que propuso', () => {
    assert.match(CRM, /cp\.por_nombre\?escHTML\(String\(cp\.por_nombre\)\)\+', tu gerente'/);
  });
});
