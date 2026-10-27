'use strict';
/* ==========================================================================
 * EL GERENTE AGREGA: LA PANTALLA DE WILLIAM — 27-oct-2026
 *
 *   node --test pruebas/el-gerente-agrega.test.js
 *
 * Joan (26-oct): «quiero que william pueda agregar bases en archivo y que
 * también pueda agregar clientes de forma manual… un botón de agregar
 * prospecto manual… y que se los podamos asignar a otros del equipo».
 *
 * El CRM en modo equipo, montado como en el-gerente-vende.test.js, con un
 * rpcEquipo de mentira que anota cada llamada. Lo que se cuida:
 *   · el gerente ve dónde agregar (menú y cabecera de «Mi base»); un asesor no;
 *   · «⤒ Cargar base» es un <label> con su <input type=file>: en el iPhone el
 *     selector solo se abre con el toque, nunca con input.click() después de
 *     esperar la red;
 *   · cada respuesta del servidor tiene su texto, «ya existe» nunca dice de
 *     quién, y sin autorización (o sin prueba) no se llama al servidor;
 *   · un archivo sube en tandas de 200, solo lo que cabe en el cupo, y cerrar
 *     el cuadro no lo para;
 *   · la información adicional se pinta en su sitio, el 📲 se cierra si Joan
 *     anotó «no autorizó», y «👤» deja elegir quién lo trabaja;
 *   · nada de esto toca DB, guardar() ni localStorage.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const pausa = () => new Promise(r => setImmediate(r));
async function asentar(n) { for (let i = 0; i < (n || 30); i++) await pausa(); }
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const YO = { nombre: 'WILLIAN', rol: 'gerente', celular: '3000000000' };
const GENTE = [
  { id: 'GP1-1-0', nombre: 'Rosa Cárdenas', celular: '3207770001', tipo: 'prospecto', etapa: 'PC', asesor: '3000000000', asesor_nombre: 'WILLIAN' },
  { id: 'GP1-1-1', nombre: 'Hernán Ospina', celular: '3207770002', tipo: 'prospecto', etapa: 'PC', asesor: '3000000002', asesor_nombre: 'LEIDY' },
  { id: 'P9-0', nombre: 'Marta Quintero', celular: '3207770003', tipo: 'prospecto', etapa: 'PC', asesor: '3000000000', asesor_nombre: 'WILLIAN' }];
const AHORA = new Date().toISOString();
const INFO = {
  'GP1-1-0': { nota: 'vende en la plaza de Kennedy', extra: { Barrio: 'Kennedy' }, origen: 'Feria de Kennedy', autoriza: true,
    canal: 'whatsapp', prueba: 'formularios firmados de la feria', subido_por: 'WILLIAN', subido_en: AHORA },
  'P9-0': { nota: '', extra: {}, origen: 'me la recomendó Nancy', autoriza: false, canal: '', prueba: '', subido_por: 'Joan',
    subido_en: '2026-09-01T10:00:00Z' } };
const CUPO = { ok: true, puede: true, motivo: '', quedan_hoy: 300, usadas_hoy: 0,
  destinos: [{ celular: '3000000000', nombre: 'WILLIAN', yo: true }, { celular: '3000000002', nombre: 'LEIDY' }, { celular: '3000000005', nombre: 'SANDRA' }],
  ultimas: [{ cuando: AHORA, archivo: 'feria-kennedy.xlsx', entraron: 244, ya_existen: 3 }] };

/* El Panel del equipo. `resp[fn]` es lo que contesta rpcEquipo: un objeto
   ({status, j}) o una función (cuerpo → {status, j}). */
function abrirEquipo(rol, resp, extra) {
  const P = abrirPanel({ red: () => Promise.reject(new Error('sin red')) });
  const yo = rol === 'asesor' ? { nombre: 'LEIDY', rol: 'asesor', celular: '3000000002' } : YO;
  P.ev('CARTERA_EQUIPO = ' + JSON.stringify(Object.assign({ ok: true, yo,
    equipo: rol === 'asesor' ? [] : [{ celular: '3000000002', nombre: 'LEIDY', rol: 'asesor' }, { celular: '3000000005', nombre: 'SANDRA', rol: 'asesor' },
      { celular: '3000000007', nombre: 'RAMIRO', rol: 'asesor' }],
    retirados: [{ celular: '3000000007', nombre: 'RAMIRO', rol: 'asesor' }],
    gente: GENTE }, extra || {})) + ';');
  P.ctx._resp = Object.assign({
    mi_cartera_info: { status: 200, j: { ok: true, info: INFO } },
    gerente_carga_cupo: { status: 200, j: CUPO },
    mi_cartera: () => ({ status: 200, j: P.ev('CARTERA_EQUIPO') })
  }, resp || {});
  P.ctx._llamadas = [];
  P.ev(`rpcEquipo = function (fn, cuerpo) {
    _llamadas.push({ fn: fn, cuerpo: JSON.parse(JSON.stringify(cuerpo || {})) });
    var r = _resp[fn]; if (typeof r === 'function') r = r(cuerpo);
    if (r && typeof r.then === 'function') return r.then(function (x) { return { ok: x.status < 400, status: x.status, j: JSON.parse(JSON.stringify(x.j)) }; });
    r = r || { status: 200, j: { ok: true } };
    if (r.falla) return Promise.reject(new Error(r.falla));
    return Promise.resolve({ ok: r.status < 400, status: r.status, j: r.j == null ? r.j : JSON.parse(JSON.stringify(r.j)) });
  };`);
  return P;
}
const llamadas = (P, fn) => P.ctx._llamadas.filter(x => !fn || x.fn === fn);
const cuerpoModal = P => plano(P.elems.mBody.innerHTML);
const llenar = (P, f) => { P.ctx._f = f; P.ev("Object.keys(_f).forEach(function (k) { document.getElementById(k).value = _f[k]; })"); };
const DATOS = { apNombreEq: 'pedro pérez', apCelEq: '57 320 999 8877', apNotaEq: 'llamarlo después de las 3',
  apOrigenEq: 'me lo recomendó un cliente', apAutorizaEq: 'si', apPruebaEq: 'me lo dijo por WhatsApp el 30-oct', apParaEq: '3000000000' };

describe('1 · dónde están los botones', () => {
  test('el gerente: «＋ Agregar prospectos» en el menú, justo debajo de «Mi base», y los dos de la cabecera', () => {
    const P = abrirEquipo('gerente');
    const menu = CRM.slice(CRM.indexOf('function modoEquipo()'), CRM.indexOf('function irEquipo('));
    const iBase = menu.indexOf("irEquipo('base')"), iAgr = menu.indexOf('agregarEq()'), iCobrar = menu.indexOf("irEquipo('cobrar')");
    assert.ok(iBase > 0 && iAgr > iBase && iAgr < iCobrar, 'no está justo debajo de «Mi base»');
    assert.match(menu, /\$\{yo\.rol === 'gerente' \? '<button class="navbtn" onclick="agregarEq\(\)">/, 'el asesor también lo vería');
    const h = P.ev("vistaBaseEquipo()");
    assert.match(h, /onclick="agregarProspectoEq\(\)">＋ Agregar prospecto<\/button>/);
    assert.match(h, /<label class="btn btn-rojo btn-sm"[^>]*>⤒ Cargar base<input type="file"/, 'Cargar base no es un <label> con su input');
    assert.match(h, /accept="\.xlsx,\.csv,text\/csv,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/);
    assert.match(h, /onchange="leerArchivoBaseEq\(this\.files&amp;&amp;this\.files\[0\]\);this\.value=''"|onchange="leerArchivoBaseEq\(this\.files&&this\.files\[0\]\);this\.value=''"/);
  });

  test('un asesor no ve ninguno, ni el «👤» de las filas', () => {
    const P = abrirEquipo('asesor');
    const h = P.ev('vistaBaseEquipo()');
    assert.ok(!/agregarProspectoEq|leerArchivoBaseEq|asignarUnoEq/.test(h), 'el asesor ve botones del gerente');
  });

  test('NUNCA input.click(): el selector se abre con el toque (el iPhone no abre otro)', () => {
    const i = CRM.indexOf('EL GERENTE AGREGA — 27-oct-2026 (bloque NUEVO del modo equipo)');
    const bloque = CRM.slice(CRM.lastIndexOf('/*', i), CRM.indexOf('fin de EL GERENTE AGREGA (equipo)', i));
    assert.ok(i > 0 && bloque.length > 1000);
    assert.doesNotMatch(bloque.replace(/\/\*[\s\S]*?\*\//g, ''), /\.click\(\)/, 'el bloque del equipo abre un input a mano');
    assert.doesNotMatch(bloque, /type="file"[^>]*(\shidden[\s>=]|display:\s*none)/, 'el input del archivo está escondido con hidden o display:none');
  });
});

describe('2 · el cuadro del menú dice por qué no, sin formulario', () => {
  const casos = [
    [{ status: 404, j: { code: 'PGRST202' } }, /Todavía no: falta un paso de Joan en la nube\. Avísale\./],
    [{ status: 200, j: { ok: true, puede: false, motivo: 'sin_acuerdo' } }, /falta que Joan anote tu acuerdo de manejo de datos con NEXECO/],
    [{ status: 200, j: { ok: true, puede: false, motivo: 'en_revision' } }, /más de 50 celulares ya existían en Tu Garantía\. Joan lo revisa/],
    [{ status: 200, j: { ok: true, puede: false, motivo: 'techo_base' } }, /Ya subiste 3\.000 personas/],
    [{ status: 200, j: { ok: true, puede: false, motivo: 'muchas_llamadas' } }, /Hoy ya intentaste agregar 100 veces\. Mañana se reinicia\./],
    [{ status: 200, j: { ok: false } }, /No pude confirmar que eres gerente/]];
  casos.forEach(([r, texto]) => {
    test(JSON.stringify(r.j), async () => {
      const P = abrirEquipo('gerente', { gerente_carga_cupo: r });
      P.ev('agregarEq()');
      await asentar();
      assert.match(cuerpoModal(P), texto);
      assert.doesNotMatch(P.elems.mBody.innerHTML, /apNombreEq|Uno a mano|type="file"/, 'pidió llenar algo que no va a servir');
      assert.doesNotMatch(cuerpoModal(P), /2\.4|receta/i, 'la pantalla cita la receta de Joan');
    });
  });

  test('con cupo: los dos caminos, el cupo en palabras y lo último que subió', async () => {
    const P = abrirEquipo('gerente');
    P.ev('agregarEq()');
    await asentar();
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /onclick="agregarProspectoEq\(\)">✍️ Uno a mano<\/button>/);
    assert.match(h, /<label[^>]*>⤒ Un archivo \(Excel o CSV\)<input type="file"/);
    assert.match(plano(h), /Hoy puedes probar 300 celulares más \(cuentan los que entran y los que ya existían\)\./);
    assert.match(plano(h), /Lo último que subiste .* · feria-kennedy\.xlsx · entraron 244/);
  });
});

describe('3 · uno a mano', () => {
  test('el cuadro: sus campos en orden, y «¿Quién lo trabaja?» sin retirados', async () => {
    const P = abrirEquipo('gerente');
    P.ev('agregarEq()'); await asentar();
    P.ev('agregarProspectoEq()');
    const h = P.elems.mBody.innerHTML;
    const orden = ['apNombreEq', 'apCelEq', 'apNotaEq', 'apOrigenEq', 'apAutorizaEq', 'apPruebaEq', 'apParaEq'].map(id => h.indexOf('id="' + id + '"'));
    assert.ok(orden.every((x, i) => x > 0 && (i === 0 || x > orden[i - 1])), 'los campos no están en el orden del plan: ' + orden);
    assert.match(h, /<textarea id="apNotaEq" rows="2" maxlength="300"/);
    assert.match(plano(h), /¿Te autorizó que le escribamos por WhatsApp para ofrecerle el crédito\?/);
    assert.match(plano(h), /No escribas cédulas, claves, deudas ni nada de salud, religión o política\./);
    assert.match(h, /<option value="3000000000" selected>Lo trabajo yo<\/option>/);
    assert.match(h, /Se lo asigno a LEIDY/);
    assert.doesNotMatch(h, /RAMIRO/);
  });

  test('con «No», o sin la prueba, NO llama al servidor y dice por qué', async () => {
    const P = abrirEquipo('gerente');
    P.ev('agregarEq()'); await asentar(); P.ev('agregarProspectoEq()');
    llenar(P, Object.assign({}, DATOS, { apAutorizaEq: 'no' }));
    P.ev('guardarProspectoEq()');
    assert.match(plano(P.elems.apErrorEq.innerHTML), /Sin su autorización no lo agrego\. Pídesela/);
    llenar(P, Object.assign({}, DATOS, { apPruebaEq: '' }));
    P.ev('guardarProspectoEq()');
    assert.match(plano(P.elems.apErrorEq.innerHTML), /Escribe dónde está la prueba de que te autorizó/);
    llenar(P, Object.assign({}, DATOS, { apCelEq: '601 555 1234' }));
    P.ev('guardarProspectoEq()');
    assert.match(plano(P.elems.apErrorEq.innerHTML), /Ese celular no me cuadra/);
    llenar(P, Object.assign({}, DATOS, { apCelEq: '3207770002' }));
    P.ev('guardarProspectoEq()');
    assert.match(plano(P.elems.apErrorEq.innerHTML), /Ese celular ya es tuyo: Hernán Ospina \(lo trabaja LEIDY\)\. No lo agrego dos veces\./);
    assert.equal(llamadas(P, 'gerente_agregar_prospectos').length, 0, 'llamó al servidor sin poder agregarlo');
  });

  test('manda el lote con la forma exacta, y al entrar lo pone arriba de «Mi base»', async () => {
    const P = abrirEquipo('gerente', { gerente_agregar_prospectos: { status: 200, j: { ok: true, carga: 7, entraron: 1, ya_en_tu_base: 0, ya_existen: 0, repetidas: 0, invalidas: 0, quedan_hoy: 299 } } });
    P.ev('agregarEq()'); await asentar(); P.ev('agregarProspectoEq()');
    llenar(P, Object.assign({}, DATOS, { apParaEq: '3000000002' }));
    P.ev("_asesorBaseEq = '3000000005'");
    P.ev('guardarProspectoEq()'); await asentar(60);
    const c = llamadas(P, 'gerente_agregar_prospectos')[0].cuerpo;
    assert.deepEqual(c, { p_lote: { archivo: '', origen: 'me lo recomendó un cliente', autoriza: 'si', prueba: 'me lo dijo por WhatsApp el 30-oct',
      filas: [{ nombre: 'Pedro Pérez', celular: '3209998877', nota: 'llamarlo después de las 3', para: '3000000002' }] } });
    assert.equal(P.ev('_grupoBaseEq'), 'recien');
    assert.equal(P.ev('_asesorBaseEq'), '', 'dejó el filtro de la asesora: escondería lo que se dejó él');
    assert.ok(llamadas(P, 'mi_cartera').length >= 1, 'no refrescó la base');
  });

  const respuestas = [
    [{ ok: true, entraron: 0, ya_existen: 1, ya_en_tu_base: 0 }, /Ese celular ya existe en Tu Garantía\. No lo agrego\. Si crees que debería ser tuyo, pídeselo a Joan\./],
    [{ ok: true, entraron: 0, ya_existen: 0, ya_en_tu_base: 1 }, /Ese celular ya es tuyo: está en «📋 Mi base» o en «📥 Registros»/],
    [{ ok: false, motivo: 'tope' }, /Hoy ya probaste 300 celulares \(cuentan los que entraron y los que ya existían\)\. Mañana se reinicia\./],
    [{ ok: false, motivo: 'para_no_es_tuyo' }, /Esa persona ya no está activa en tu equipo/],
    [{ ok: false, motivo: 'solo_gerente' }, /No pude confirmar que eres gerente/]];
  respuestas.forEach(([j, texto]) => {
    test('respuesta ' + JSON.stringify(j), async () => {
      const P = abrirEquipo('gerente', { gerente_agregar_prospectos: { status: 200, j } });
      P.ev('agregarEq()'); await asentar(); P.ev('agregarProspectoEq()');
      llenar(P, DATOS);
      P.ev('guardarProspectoEq()'); await asentar();
      const t = plano(P.elems.apErrorEq.innerHTML);
      assert.match(t, texto);
      assert.doesNotMatch(t, /Rosa|Hernán|cliente de|es de/, '«ya existe» dice de quién');
    });
  });

  test('sin el SQL (404) lo dice; sin red, no promete nada', async () => {
    const P = abrirEquipo('gerente', { gerente_agregar_prospectos: { status: 404, j: { code: 'PGRST202' } } });
    P.ev('agregarEq()'); await asentar(); P.ev('agregarProspectoEq()');
    llenar(P, DATOS); P.ev('guardarProspectoEq()'); await asentar();
    assert.match(plano(P.elems.apErrorEq.innerHTML), /falta un paso de Joan en la nube/);
    const Q = abrirEquipo('gerente', { gerente_agregar_prospectos: { falla: 'Failed to fetch' } });
    Q.ev('agregarEq()'); await asentar(); Q.ev('agregarProspectoEq()');
    llenar(Q, DATOS); Q.ev('guardarProspectoEq()'); await asentar();
    assert.match(plano(Q.elems.apErrorEq.innerHTML), /No pude agregarlo: .*No se guardó nada; vuelve a intentar\./);
  });
});

describe('4 · un archivo', () => {
  const CSV = n => 'Nombre;Celular;Barrio;Cédula\r\n' + Array.from({ length: n }, (_, i) =>
    ['PERSONA ' + ['ANA', 'LUZ', 'JOSE', 'PEDRO', 'MARTA', 'JUAN', 'ROSA'][i % 7] + ' ' + ['GOMEZ', 'ROJAS', 'PARDO', 'NIÑO', 'RUIZ'][i % 5] + ' ' + i,
      String(3209000000 + i), ['Kennedy', 'Bosa', 'Suba'][i % 3], String(1000000000 + i)].join(';')).join('\r\n');
  const archivo = (n, nombre) => ({ name: nombre || 'feria.csv', text: () => Promise.resolve(CSV(n)) });

  test('450 con cupo de 300: «Subir las primeras 300», dos tandas (200 y 100), con su avance', async () => {
    const tandas = [];
    const P = abrirEquipo('gerente', { gerente_agregar_prospectos: c => {
      tandas.push(c.p_lote.filas.length);
      return { status: 200, j: { ok: true, entraron: c.p_lote.filas.length, ya_existen: 0, ya_en_tu_base: 0, repetidas: 0, invalidas: 0, quedan_hoy: 0 } };
    } });
    P.ctx._archivo = archivo(450);
    P.ev('leerArchivoBaseEq(_archivo)'); await asentar(60);
    const h = P.elems.mBody.innerHTML;
    assert.match(plano(h), /Para subir 450 personas con celular/);
    assert.match(plano(h), /Hoy puedes probar 300 celulares más\. Este archivo trae 450\./);
    /* 27-oct-2026, revisión — «Las filas 1 a 300» era falso al día siguiente:
       lo que ya es suyo no se cuenta, así que suben las primeras que no lo son. */
    assert.match(plano(h), /Las primeras 300 del archivo que todavía no son tuyas\. Las demás, mañana, con el mismo archivo: .*las que ya te dieron «ya existe» no vuelven a gastar cupo\./);
    assert.doesNotMatch(plano(h), /Las filas 1 a/);
    assert.match(h, /id="baseBotonEq"[^>]*>Subir las primeras 300<\/button>/);
    /* Las casillas, SIN marcar; la cédula no se ofrece y se dice por qué. */
    assert.match(h, /<input type="checkbox" id="exEq_0" onchange="pintarMuestraEq\(\)">/);
    assert.doesNotMatch(h, /checked/);
    assert.match(plano(h), /No se guardan: Cédula \(es un documento\)/);
    llenar(P, { baseOrigenEq: 'Feria de Kennedy, 30-oct', baseAutorizaEq: 'si', basePruebaEq: 'formularios firmados de la feria', baseParaEq: 'yo' });
    P.elems.exEq_0.checked = true;
    P.ev('subirBaseEq()'); await asentar(120);
    assert.deepEqual(tandas, [200, 100]);
    const f0 = llamadas(P, 'gerente_agregar_prospectos')[0].cuerpo.p_lote;
    assert.equal(f0.archivo, 'feria.csv');
    assert.equal(f0.autoriza, 'si');
    assert.deepEqual(f0.filas[0].extra, { Barrio: 'Kennedy' }, 'la columna marcada no viajó');
    assert.equal('Cédula' in (f0.filas[0].extra || {}), false);
    assert.equal(llamadas(P, 'mi_cartera').length, 2, 'no refrescó la base después de cada tanda en la que entró alguien');
    assert.match(cuerpoModal(P), /Listo\. Entraron 300 a tu base\./);
    /* 27-oct-2026, revisión — y dice cuántos quedaron sin subir (antes callaba los 150). */
    assert.match(cuerpoModal(P), /Quedan 150 de este archivo por subir: no cabían en el cupo de hoy\. Mañana vuelve a subir el mismo archivo/);
  });

  test('cerrar el cuadro a mitad NO para la subida, y el resultado se vuelve a abrir', async () => {
    let n = 0;
    const sueltas = [];   /* cada tanda contesta cuando la prueba la suelta: así «a mitad» es a mitad de verdad */
    const P = abrirEquipo('gerente', { gerente_carga_cupo: { status: 200, j: Object.assign({}, CUPO, { quedan_hoy: 500 }) },
      gerente_agregar_prospectos: c => { n++; return new Promise(r => sueltas.push(() =>
        r({ status: 200, j: { ok: true, entraron: c.p_lote.filas.length - 2, ya_existen: 2, quedan_hoy: 100 } }))); } });
    P.ctx._archivo = archivo(450);
    P.ev('leerArchivoBaseEq(_archivo)'); await asentar(60);
    llenar(P, { baseOrigenEq: 'Feria', baseAutorizaEq: 'si', basePruebaEq: 'formularios firmados', baseParaEq: 'parejo' });
    P.ev('subirBaseEq()');
    await asentar();
    assert.equal(n, 1);
    sueltas.shift()(); await asentar();
    assert.match(plano(P.elems.baseErrorEq.innerHTML), /Subiendo… 200 de 450\./, 'no mostró el avance');
    P.ev('cerrarModal()');
    assert.ok(P.ev('!!_subidaEq'), 'la subida no estaba en curso');
    P.ev('agregarEq()');
    assert.match(cuerpoModal(P), /Todavía estoy subiendo feria\.csv: 200 de 450\./);
    P.ev('cerrarModal()');
    for (let k = 0; k < 2; k++) { await asentar(); assert.ok(sueltas.length, 'la tanda ' + (k + 2) + ' no salió'); sueltas.shift()(); }
    await asentar(60);
    assert.equal(n, 3, 'cerrar el cuadro cortó la subida');
    assert.match(cuerpoModal(P), /Listo\. Entraron 444 a tu base\./);
    assert.match(cuerpoModal(P), /Ya existían en Tu Garantía: 6\. No te digo de quién/);
    const paras = llamadas(P, 'gerente_agregar_prospectos')[0].cuerpo.p_lote.filas.slice(0, 3).map(f => f.para);
    assert.deepEqual(paras, ['3000000002', '3000000005', '3000000002'], 'no repartió parejo en el orden del archivo');
  });

  test('si el freno llega a mitad: lo dice, con lo que alcanzó a entrar', async () => {
    let n = 0;
    const P = abrirEquipo('gerente', { gerente_agregar_prospectos: c => (++n === 1
      ? { status: 200, j: { ok: true, entraron: 150, ya_existen: 50, quedan_hoy: 100 } }
      : { status: 200, j: { ok: false, motivo: 'en_revision' } }) });
    P.ctx._archivo = archivo(300);
    P.ev('leerArchivoBaseEq(_archivo)'); await asentar(60);
    llenar(P, { baseOrigenEq: 'Feria', baseAutorizaEq: 'si', basePruebaEq: 'formularios firmados', baseParaEq: 'yo' });
    P.ev('subirBaseEq()'); await asentar(120);
    assert.match(cuerpoModal(P), /Paré en la tanda 2 de 2: ya existían más de 50\. Joan lo revisa antes de que sigas\. Entraron 150\. Cuando te dé paso, vuelve a subir el mismo archivo: los que ya existían en lo que subiste no vuelven a contar\./);
  });

  test('27-oct, revisión: si el freno llega en la PRIMERA tanda, no hay «Listo» en verde (entró 0)', async () => {
    const P = abrirEquipo('gerente', { gerente_agregar_prospectos: { status: 200, j: { ok: false, motivo: 'en_revision' } } });
    P.ctx._archivo = archivo(160);
    P.ev('leerArchivoBaseEq(_archivo)'); await asentar(60);
    llenar(P, { baseOrigenEq: 'Feria', baseAutorizaEq: 'si', basePruebaEq: 'formularios firmados', baseParaEq: 'yo' });
    P.ev('subirBaseEq()'); await asentar(120);
    const h = P.elems.mBody.innerHTML;
    assert.match(plano(h), /Paré en la tanda 1 de 1/);
    assert.match(plano(h), /No entró nadie a tu base\./);
    assert.doesNotMatch(plano(h), /Listo\. Entraron 0/);
    assert.doesNotMatch(h, /alerta ok/, 'con 0 sale en verde, debajo de «Paré…»');
  });

  test('sin «Sí» no se sube, y sin cupo (o sin acuerdo) no se pinta el previo', async () => {
    const P = abrirEquipo('gerente');
    P.ctx._archivo = archivo(10);
    P.ev('leerArchivoBaseEq(_archivo)'); await asentar(60);
    llenar(P, { baseOrigenEq: 'Feria', baseAutorizaEq: 'no', basePruebaEq: 'x' });
    P.ev("mostrarPruebaEq('base')");
    assert.equal(P.elems.baseBotonEq.disabled, true);
    assert.match(plano(P.elems.baseNoEq.innerHTML), /Sin autorización no se sube/);
    P.ev('subirBaseEq()');
    assert.equal(llamadas(P, 'gerente_agregar_prospectos').length, 0);
    const Q = abrirEquipo('gerente', { gerente_carga_cupo: { status: 200, j: { ok: true, puede: false, motivo: 'sin_acuerdo' } } });
    Q.ctx._archivo = archivo(10);
    Q.ev('leerArchivoBaseEq(_archivo)'); await asentar(60);
    assert.match(cuerpoModal(Q), /falta que Joan anote tu acuerdo/);
    assert.doesNotMatch(Q.elems.mBody.innerHTML, /baseBotonEq/);
  });

  test('un archivo que no se lee: el texto de Joan, y en el celular, «prueba guardarlo como CSV»', async () => {
    const P = abrirEquipo('gerente');
    P.ctx._archivo = { name: 'roto.xlsx', arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)) };
    P.ev('leerArchivoBaseEq(_archivo)'); await asentar(60);
    assert.match(cuerpoModal(P), /Sirve un Excel \(\.xlsx\) o un CSV/);
    assert.match(cuerpoModal(P), /Si es un \.xlsx y estás en el celular, prueba guardarlo como CSV\./);
  });
});

describe('5 · gestionar y asignar', () => {
  test('la fila pinta la nota, el extra, el origen, la prueba y «⚠ No autorizó contacto»; el 👤 lleva solo el id', async () => {
    const P = abrirEquipo('gerente');
    await P.ev('traerInfoEq()');
    const rosa = P.ev("filaPersonaEq(genteEquipo()[0])");
    assert.match(plano(rosa), /📝 «vende en la plaza de Kennedy»/);
    assert.match(plano(rosa), /Barrio: Kennedy/);
    assert.match(plano(rosa), /De dónde salió: Feria de Kennedy · lo subió WILLIAN el/);
    assert.match(plano(rosa), /Autorizó por WhatsApp · prueba: «formularios firmados de la feria»/);
    assert.match(rosa, /onclick="asignarUnoEq\('GP1-1-0'\)"/);
    const marta = P.ev("filaPersonaEq(genteEquipo()[2])");
    assert.match(marta, /<span class="chip mora">⚠ No autorizó contacto<\/span>/);
    const A = abrirEquipo('asesor');
    await A.ev('traerInfoEq()');
    const deLeidy = A.ev("filaPersonaEq(genteEquipo()[1])");
    assert.doesNotMatch(deLeidy, /asignarUnoEq/, 'el asesor ve el 👤');
  });

  test('la información llega EN SU SITIO, sin volver a pintar la vista (ni subir al tope)', async () => {
    const P = abrirEquipo('gerente');
    P.ev('var __ir = 0, __irOrig = irEquipo; irEquipo = function (v) { __ir++; return __irOrig(v); };');
    const hueco = { getAttribute: () => 'GP1-1-0', innerHTML: '' };
    P.ctx.document.querySelectorAll = sel => (sel === '[data-info-eq]' ? [hueco] : []);
    await P.ev('traerInfoEq()');
    assert.match(plano(hueco.innerHTML), /vende en la plaza de Kennedy/);
    assert.equal(P.ev('__ir'), 0, 'traerInfoEq llamó a irEquipo');
  });

  test('si mi_cartera_info falla, una línea lo dice (una fila sin chip no dice «se puede»)', async () => {
    const P = abrirEquipo('gerente', { mi_cartera_info: { status: 500, j: { message: 'error' } } });
    await P.ev('traerInfoEq()');
    assert.match(plano(P.ev('avisosBaseEq()')), /No pude traer la información adicional \(nota, origen, autorización\)\. Recarga para volver a intentar\./);
    const Q = abrirEquipo('gerente', { mi_cartera_info: { status: 404, j: { code: 'PGRST202' } } });
    await Q.ev('traerInfoEq()');
    assert.doesNotMatch(plano(Q.ev('avisosBaseEq()')), /No pude/, 'sin el SQL no hay información que extrañar');
  });

  test('«🆕 Recién agregados»: lo de los últimos 7 días; y si la información no llegó, lo dice', async () => {
    const P = abrirEquipo('gerente');
    await P.ev('traerInfoEq()');
    P.ev("_grupoBaseEq = 'recien'");
    const h = plano(P.ev('vistaBaseEquipo()'));
    assert.match(h, /🆕 Recién agregados \(1\)/);
    assert.match(h, /Rosa Cárdenas/);
    assert.doesNotMatch(h, /Marta Quintero/);
    const Q = abrirEquipo('gerente', { mi_cartera_info: { falla: 'sin red' } });
    await Q.ev('traerInfoEq()');
    Q.ev("_grupoBaseEq = 'recien'");
    assert.match(plano(Q.ev('vistaBaseEquipo()')), /No pude traer la información adicional: sin ella no sé quién es reciente\./);
  });

  /* 27-oct-2026, revisión — LO NUEVO, ARRIBA. Ordenado por etapa, Zoila (la
     que William agregó a mano después de una carga de 240) era la fila 241. Y
     lo de Joan sin su fecha de carga ('-infinity') no es reciente ni dice una
     fecha inventada. */
  test('«🆕 Recién agregados»: del más nuevo al más viejo; lo de Joan sin fecha no entra ni dice «el <hoy>»', async () => {
    const hace = h => new Date(Date.now() - h * 3600000).toISOString();
    const gente = [
      { id: 'GP-a', nombre: 'Feria Uno', celular: '3207771001', tipo: 'prospecto', etapa: 'MORA', asesor: '3000000000' },
      { id: 'GP-b', nombre: 'Feria Dos', celular: '3207771002', tipo: 'prospecto', etapa: 'PC', asesor: '3000000000' },
      { id: 'GP-z', nombre: 'Zoila Rosa Mendoza', celular: '3207771003', tipo: 'prospecto', etapa: 'PC', asesor: '3000000000' },
      { id: 'P-viejo', nombre: 'Lucía De Joan', celular: '3207771004', tipo: 'prospecto', etapa: 'PC', asesor: '3000000000' }];
    const info = {
      'GP-a': { origen: 'feria', subido_por: 'WILLIAN', subido_en: hace(3) },
      'GP-b': { origen: 'feria', subido_por: 'WILLIAN', subido_en: hace(3) },
      'GP-z': { origen: 'me la recomendó un cliente', subido_por: 'WILLIAN', subido_en: hace(0.01) },
      'P-viejo': { origen: 'pauta de Facebook, septiembre', subido_por: 'Joan', subido_en: '-infinity' } };
    const P = abrirEquipo('gerente', { mi_cartera_info: { status: 200, j: { ok: true, info } } }, { gente });
    await P.ev('traerInfoEq()');
    P.ev("_grupoBaseEq = 'recien'");
    const t = plano(P.ev('vistaBaseEquipo()'));
    assert.match(t, /🆕 Recién agregados \(3\)/);
    assert.match(t, /3 personas, de la más nueva a la más vieja/);
    assert.ok(t.indexOf('Zoila') >= 0 && t.indexOf('Zoila') < t.indexOf('Feria Uno'), 'la recién agregada no va arriba');
    assert.doesNotMatch(t, /Lucía De Joan/, 'lo de Joan sin fecha cuenta como reciente');
    const lucia = plano(P.ev("filaPersonaEq(genteEquipo()[3])"));
    assert.match(lucia, /De dónde salió: pauta de Facebook, septiembre · lo subió Joan/);
    assert.doesNotMatch(lucia, /lo subió Joan el/, 'inventó una fecha');
    P.ev("_grupoBaseEq = 'todos'");
    assert.match(plano(P.ev('vistaBaseEquipo()')), /de la más urgente a la más tranquila/);
  });

  /* 27-oct-2026, revisión — EL 📲 DE «HOY» Y DE «AGENDA». El Panel abre en
     «Hoy» y la información solo la pedía «📋 Mi base»: con la sesión recién
     abierta, el 📲 de la cita de Marta (Joan anotó «No autorizó») abría
     «Escribirle a Marta» con sus plantillas. */
  test('el 📲 de una cita (Hoy / Agenda), con la sesión recién abierta, también se cierra si no autorizó', async () => {
    const P = abrirEquipo('asesor');
    assert.equal(P.ev('INFO_EQ'), null, 'la prueba no arranca sin la información');
    P.ev('AGENDA_EQ = ' + JSON.stringify([{ id: 5, titulo: 'Llamar', cuando: '2026-10-27', tipo: 'llamada', persona_id: 'P9-0',
      persona_nombre: 'Marta Quintero', persona_celular: '3207770003', quien: '3000000002', para: '3000000002' }]) + ';');
    const h = P.ev('filaCitaEq(AGENDA_EQ[0])');
    assert.match(h, /onclick="contactarEq\('P9-0','3207770003'\)"/);
    P.ev("contactarEq('P9-0','3207770003')"); await asentar();
    assert.ok(llamadas(P, 'mi_cartera_info').length >= 1, 'no preguntó si autorizó');
    assert.equal(P.elems.mTitle.textContent, 'No autorizó que le escribamos');
    assert.doesNotMatch(P.elems.mBody.innerHTML, /plEq|Abrir WhatsApp/, 'ofreció las plantillas');
    /* CONTROL: con la de Rosa (autorizó) no se cierra. */
    P.ev("contactarEq('GP1-1-0','3207770001')"); await asentar();
    assert.doesNotMatch(P.elems.mTitle.textContent, /No autorizó|No pude confirmar|Un momento/, 'cerró el de alguien que autorizó');
  });

  test('si no se pudo saber si autorizó, el 📲 de un prospecto no se abre; el de un cliente sí (no tiene esa información)', async () => {
    const P = abrirEquipo('asesor', { mi_cartera_info: { falla: 'sin red' } }, {
      gente: GENTE.concat([{ id: 'S7', nombre: 'Carlos Cliente', celular: '3207770009', tipo: 'cliente', etapa: 'D0', asesor: '3000000002' }]) });
    P.ev("contactarEq('GP1-1-1','3207770002')"); await asentar();
    assert.equal(P.elems.mTitle.textContent, 'No pude confirmar si autorizó');
    assert.match(cuerpoModal(P), /Sin saberlo no te abro WhatsApp\. Revisa la señal y vuelve a tocar 📲\./);
    const antes = llamadas(P, 'mi_cartera_info').length;
    P.ev("contactarEq('S7','3207770009')"); await asentar();
    assert.doesNotMatch(P.elems.mTitle.textContent, /No pude confirmar|No autorizó/);
    assert.equal(llamadas(P, 'mi_cartera_info').length, antes, 'para un cliente fue a preguntar');
  });

  test('el 📲 de alguien que no autorizó no abre WhatsApp ni ofrece plantillas', async () => {
    const P = abrirEquipo('asesor');
    await P.ev('traerInfoEq()');
    const abiertos = [];
    P.ctx.open = u => abiertos.push(u);
    P.ev("contactarEq('P9-0','3207770003')");
    assert.equal(P.elems.mTitle.textContent, 'No autorizó que le escribamos');
    assert.match(cuerpoModal(P), /Joan anotó que esta persona no autorizó que la contactemos/);
    assert.doesNotMatch(P.elems.mBody.innerHTML, /plantilla|abrirWhatsappEq/i);
    assert.deepEqual(abiertos, []);
    assert.equal(llamadas(P, 'contacto_anotar').length, 0);
  });

  test('«👤»: «Yo (WILLIAN)» y sus asesores activos, sin retirados; asignar usa asignar_a', async () => {
    const P = abrirEquipo('gerente', { asignar_a: { status: 200, j: { ok: true, repartidos: 1 } } });
    P.ev("asignarUnoEq('GP1-1-0')");
    assert.equal(P.elems.mTitle.textContent, '👤 ¿Quién trabaja a Rosa?');
    const h = P.elems.mBody.innerHTML;
    assert.match(plano(h), /Yo \(WILLIAN\) \(lo tiene ahora\)/);
    assert.match(h, /onclick="confirmarAsignarUnoEq\('GP1-1-0','3000000002'\)"/);
    assert.doesNotMatch(h, /RAMIRO/);
    P.ev("confirmarAsignarUnoEq('GP1-1-0','3000000002')"); await asentar();
    assert.deepEqual(llamadas(P, 'asignar_a')[0].cuerpo, { p_personas: ['GP1-1-0'], p_asesor: '3000000002' });
    assert.match(cuerpoModal(P), /Listo: ahora lo trabaja LEIDY\. Le sale en su «Mi base»\./);
  });
});

test('6 · NADA de esto toca DB, guardar() ni localStorage (en modo equipo DB está vacía a propósito)', async () => {
  const P = abrirEquipo('gerente', { gerente_agregar_prospectos: c => ({ status: 200, j: { ok: true, entraron: c.p_lote.filas.length, quedan_hoy: 100 } }),
    asignar_a: { status: 200, j: { ok: true } } });
  P.ev('var __guardar = 0, __g = guardar; guardar = function () { __guardar++; return __g.apply(this, arguments); };');
  const escrito = [];
  const set = P.ctx.localStorage.setItem;
  P.ctx.localStorage.setItem = (k, v) => { escrito.push(k); return set(k, v); };
  P.ev('agregarEq()'); await asentar(); P.ev('agregarProspectoEq()');
  llenar(P, DATOS); P.ev('guardarProspectoEq()'); await asentar(60);
  P.ctx._archivo = { name: 'f.csv', text: () => Promise.resolve('Nombre;Celular\r\nANA GOMEZ PEREZ;3209000001\r\nLUZ ROJAS RUIZ;3209000002') };
  P.ev('leerArchivoBaseEq(_archivo)'); await asentar(60);
  llenar(P, { baseOrigenEq: 'Feria', baseAutorizaEq: 'si', basePruebaEq: 'formularios firmados', baseParaEq: 'yo' });
  P.ev('subirBaseEq()'); await asentar(80);
  P.ev("asignarUnoEq('GP1-1-0')"); P.ev("confirmarAsignarUnoEq('GP1-1-0','3000000002')"); await asentar();
  assert.equal(P.ev('__guardar'), 0, 'una función del equipo llamó a guardar()');
  assert.deepEqual(escrito.filter(k => k !== 'tg_panel_sesion'), [], 'una función del equipo escribió en localStorage');
  assert.equal(P.ev('(DB.prospectos || []).length'), 0, 'algo del equipo cayó en DB');
});
