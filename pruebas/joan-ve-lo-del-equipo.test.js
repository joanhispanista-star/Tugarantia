'use strict';
/* ==========================================================================
 * JOAN VE LO DEL EQUIPO — 27-oct-2026 (el gerente agrega, lado de Joan)
 *
 *   node --test pruebas/joan-ve-lo-del-equipo.test.js
 *
 * El CRM de Joan con su nube de mentira (rpc anotado). Lo que se cuida:
 *   · la tarjeta «⤒ Lo que subió tu equipo» en sus estados, la franja del
 *     freno («Ya lo revisé: que siga») y «lleva N de 3.000»; el 404 nombra el
 *     archivo y no el paso de la receta;
 *   · ver una carga y reasignarla a cualquiera, también a «Nadie (soltarlo)»;
 *   · «＋ Agregar prospecto» guarda la nota y, EN ESE MOMENTO, se niega con un
 *     celular del equipo o con uno que pidió que lo borraran; si no pudo mirar,
 *     lo agrega y lo dice; la ayuda de la nota no promete un viaje que no hay;
 *   · «⤒ Cargar base» guarda solo las columnas marcadas y las pesa;
 *   · Repartir y LA COMPUERTA de publicar no mandan a la gente del equipo;
 *   · los celulares y la información de Joan viajan al equipo;
 *   · REGRESIÓN DE LA SONDA (2): el gerente reasigna y Joan ya no lo deshace
 *     (con la fecha de la nube, con su marca pendiente, tras fusionar, y un
 *     CONTROL que muestra el defecto);
 *   · lo del equipo (GP…) no entra a este navegador ni se republica;
 *   · el chip de Registrados y «🚫 Borrar a alguien que lo pidió».
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
const isoLocal = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const HOY = isoLocal(new Date());
const HACE7 = isoLocal(new Date(Date.now() - 7 * 86400000));
const aca = v => JSON.parse(JSON.stringify(v));

const EQUIPO = [{ id: 'g1', nombre: 'WILLIAN', rol: 'gerente', estado: 'activo', celular: '3000000000' },
  { id: 'a1', nombre: 'LEIDY', rol: 'asesor', estado: 'activo', celular: '3000000002', jefe: 'g1' },
  { id: 'g2', nombre: 'OTRO', rol: 'gerente', estado: 'activo', celular: '3000000009' }];
const CARTERA = {
  config: { negocio: 'Tu Garantía' }, socios: [], prestamos: [], equipo: EQUIPO, asignaciones: [], gestiones: [],
  prospectos: [
    { id: 'P1-0', nombre: 'Marta Q', celular: '3001110001', estado: 'nuevo', base: 'septiembre.xlsx', cargadoEn: '2026-09-26' },
    { id: 'P1-1', nombre: 'Juan Z', celular: '3001110002', estado: 'nuevo', base: 'septiembre.xlsx', cargadoEn: '2026-09-26', nota: 'tiene una tienda', extra: { Barrio: 'Suba' } },
    { id: 'P1-2', nombre: 'Rosa Y', celular: '3001110003', estado: 'nuevo', base: 'A mano', origen: 'me la recomendó Nancy', autorizaInvitacion: false, cargadoEn: '2026-10-20' }],
  bases: [{ id: 'B1', archivo: 'septiembre.xlsx', origen: 'pauta de Facebook', fecha: '2026-09-26', entraron: 2 }]
};

/* `resp[fn]`: lo que contesta la nube (un valor, una función de los
   argumentos, o {falla: 'texto'} para un rechazo con ese motivo). */
function abrirJoan(resp, cartera) {
  const P = abrirPanel();
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave', clave: 'clave-larga-de-prueba' });
  P.cargarCartera(aca(cartera || CARTERA));
  P.ctx._resp = resp || {};
  P.ctx._llamadas = [];
  P.ctx._avisos = [];
  P.ev(`rpc = function (fn, args) {
    _llamadas.push({ fn: fn, args: JSON.parse(JSON.stringify(args || {})) });
    var r = _resp[fn]; if (typeof r === 'function') r = r(args);
    if (r && r.falla) return Promise.reject({ motivo: r.falla });
    return Promise.resolve(r === undefined ? null : JSON.parse(JSON.stringify(r)));
  };
  confirm = function (m) { _avisos.push('¿' + m); return true; };
  alert = function (m) { _avisos.push(String(m)); };
  estoyOcupado = function () { return false; };`);
  return P;
}
const llamadas = (P, fn) => P.ctx._llamadas.filter(x => !fn || x.fn === fn);
const avisos = P => P.ctx._avisos.join('\n');
const FALTA = { falla: 'Tu base todavía no tiene «x». Vuelve a correr base/supabase.sql completo en el SQL Editor.' };
const AGREGADOS = {
  cargas: [
    { id: 41, ids: [41, 42], quien: '3000000000', quien_nombre: 'WILLIAN', cuando: '2026-10-30T15:00:00Z', archivo: 'feria-kennedy.xlsx',
      origen: 'Feria de Kennedy', prueba: 'formularios firmados', entraron: 244, ya_existen: 38, tandas: 2, rechazo: '',
      registrados: 3, registrados_sin_gestion_previa: 2 },
    { id: 39, ids: [39], quien: '3000000000', quien_nombre: 'WILLIAN', cuando: '2026-10-29T15:00:00Z', archivo: '', origen: 'un cliente',
      prueba: 'WhatsApp del 29-oct', entraron: 3, ya_existen: 0, tandas: 3, rechazo: '', registrados: 0, registrados_sin_gestion_previa: 0 },
    { id: 43, ids: [43], quien: '3000000009', quien_nombre: 'OTRO', cuando: '2026-10-30T20:10:00Z', archivo: 'otra.csv', origen: 'x', prueba: 'y',
      entraron: 0, ya_existen: 61, tandas: 1, rechazo: 'tope_ya_existen' }],
  frenados: [{ quien: '3000000009', quien_nombre: 'OTRO', desde: '2026-10-30T20:10:00Z', carga: 43, ya_existen: 61 }],
  por_gerente: [{ quien: '3000000000', quien_nombre: 'WILLIAN', subidos: 2480, techo: 3000 }]
};

describe('1 · la tarjeta «⤒ Lo que subió tu equipo»', () => {
  test('está en Bases, entre «📇 Prospectos» y «⤒ Bases que has cargado», y dice que no ocupa espacio aquí', () => {
    const v = CRM.slice(CRM.indexOf('<section class="view" id="v-bases">'), CRM.indexOf('<section class="view" id="v-equipo">'));
    const a = v.indexOf('id="tblProspectos"'), b = v.indexOf('id="tblDelEquipo"'), c = v.indexOf('id="tblBases"');
    assert.ok(a > 0 && b > a && c > b);
    assert.match(v, /Vive en la nube: no ocupa espacio en este navegador/);
  });

  test('sus estados: sin nube, mirando, sin el SQL (nombra el archivo), vacío', async () => {
    const S = abrirJoan(); S.almacen.joan_socios_sb = '{}';
    S.ev('pintarSubidoPorElEquipo()');
    assert.match(S.elems.tblDelEquipo.innerHTML, /Conecta la nube en Ajustes/);
    const F = abrirJoan({ equipo_agregados: FALTA });
    F.ev('pintarSubidoPorElEquipo()');
    assert.match(F.elems.tblDelEquipo.innerHTML, /Mirando la nube…/);
    await asentar();
    assert.match(F.elems.tblDelEquipo.innerHTML, /Falta correr en Supabase el archivo base\/20261027_el_gerente_agrega\.sql\. Hasta entonces tu equipo no puede subir a nadie\./);
    assert.doesNotMatch(F.elems.tblDelEquipo.innerHTML, /2\.4|receta/i);
    const V = abrirJoan({ equipo_agregados: { cargas: [], frenados: [], por_gerente: [] } });
    V.ev('pintarSubidoPorElEquipo()'); await asentar();
    assert.match(V.elems.tblDelEquipo.innerHTML, /Tu equipo todavía no ha subido a nadie\./);
  });

  test('con datos: la franja del freno, «lleva N de 3.000» y «Se registraron 3 (2 sin gestión antes)»', async () => {
    const P = abrirJoan({ equipo_agregados: AGREGADOS, equipo_soltar: { ok: true } });
    P.ev('pintarSubidoPorElEquipo()'); await asentar();
    const h = P.elems.tblDelEquipo.innerHTML, t = plano(h);
    /* 27-oct-2026, ronda 2 — «se le juntaron» (desde el último «que siga»), y
       «Ver cuáles» pide solo esos (verYaExistianNuevos). */
    assert.match(t, /⛔ OTRO está parado desde el .*se le juntaron 61 celulares que ya existían en Tu Garantía\. Míralos antes de darle paso\./);
    assert.match(h, /onclick="verYaExistianNuevos\(43\)">Ver cuáles<\/button>/);
    assert.match(h, /onclick="soltarGerente\('3000000009'\)">Ya lo revisé: que siga<\/button>/);
    assert.match(t, /WILLIAN lleva 2\.480 de 3\.000/);
    assert.match(t, /feria-kennedy\.xlsx/);
    assert.match(t, /3 \(2 sin gestión antes\)/);
    assert.match(t, /a mano \(3\)/);
    assert.match(t, /rechazada: se paró: más de 50 ya existían/);
    assert.match(h, /onclick="verCargaDelEquipo\(41\)"/);
    assert.match(t, /sin decir de quién\. Pero comparando con su base puede deducir cuáles eran/);
    P.ev("soltarGerente('3000000009')"); await asentar();
    assert.deepEqual(llamadas(P, 'equipo_soltar')[0].args, { p_clave: 'clave-larga-de-prueba', p_quien: '3000000009' });
  });

  /* 27-oct-2026, revisión — «cuáles» de una fila que junta varias tandas
     mandaba solo la primera: «a mano (4) · Ya existían 3 · cuáles» abría
     «Ninguno». Y el origen de «a mano» era el de la última llamada del día,
     aunque esa diera «ya existe». */
  test('«cuáles» y «Ver cuáles» piden TODAS las tandas; con varios orígenes no se pinta uno solo', async () => {
    const d = JSON.parse(JSON.stringify(AGREGADOS));
    d.cargas.push({ id: 50, ids: [50, 51, 52, 53], quien: '3000000000', quien_nombre: 'WILLIAN', cuando: '2026-10-31T15:00:00Z', archivo: '',
      origen: 'me lo recomendó un cliente', prueba: 'chat del 30-oct', origenes: 2, pruebas: 2, entraron: 1, ya_existen: 3, tandas: 4, rechazo: '' });
    d.frenados[0].cargas = [40, 43];
    const P = abrirJoan({ equipo_agregados: d, equipo_ya_existian: [{ celular: '3001112233', donde: 'base de OTRO' }],
      equipo_agregados_de: { total: 1, gente: [{ id: 'GP5', nombre: 'Pedro', celular: '3200000005', origen: 'me lo recomendó un cliente',
        prueba: 'me lo dijo por WhatsApp el 30-oct y tengo el chat', asesor_nombre: 'WILLIAN' }] } });
    P.ev('pintarSubidoPorElEquipo()'); await asentar();
    const h = P.elems.tblDelEquipo.innerHTML;
    assert.match(h, /onclick="verYaExistian\(41,42\);return false">cuáles<\/a>/, 'el archivo de dos tandas manda solo la primera');
    assert.match(h, /onclick="verYaExistian\(50,51,52,53\);return false">cuáles<\/a>/, 'lo de a mano manda solo la primera');
    assert.match(h, /onclick="verYaExistianNuevos\(40,43\)">Ver cuáles<\/button>/, 'la franja manda solo la tanda que lo paró');
    const fila = plano(h.slice(h.indexOf('a mano (4)') - 400, h.indexOf('a mano (4)') + 600));
    assert.match(fila, /varios: cada uno en «Ver»/);
    assert.doesNotMatch(fila, /me lo recomendó un cliente/, 'pintó un origen que no es de todos');
    P.ev('verYaExistian(50,51,52,53)'); await asentar();
    assert.deepEqual(llamadas(P, 'equipo_ya_existian')[0].args, { p_clave: 'clave-larga-de-prueba', p_cargas: [50, 51, 52, 53] });
    assert.match(P.elems.mTitle.textContent, /Los que ya existían \(1\)/);
    P.ev('verCargaDelEquipo(50)'); await asentar();
    const v = plano(P.elems.mBody.innerHTML);
    assert.match(v, /De dónde salió: varios: cada uno en «Ver»/);
    assert.match(v, /De dónde salió Lo trabaja/, 'la tabla no tiene la columna del origen');
    assert.match(v, /me lo recomendó un cliente prueba: me lo dijo por WhatsApp el 30-oct y tengo el chat/);
    /* Un archivo con un solo origen no repite la misma frase en cada fila: ya la dice arriba. */
    P.ev('verCargaDelEquipo(41)'); await asentar();
    assert.doesNotMatch(P.elems.mBody.innerHTML, /<th>De dónde salió<\/th>/);
    assert.match(plano(P.elems.mBody.innerHTML), /De dónde salió: Feria de Kennedy · Prueba: formularios firmados/);
  });

  /* 27-oct-2026, ronda 2 — LOS NÚMEROS CUADRAN. La franja dice los «ya
     existe» nuevos desde el último «que siga», y «Ver cuáles» abría también
     los que Joan ya había revisado en el freno anterior (51 abría 111). */
  test('«Ver cuáles» de la franja pide SOLO los nuevos (p_solo_nuevos); el «cuáles» de una fila, todos los de sus tandas', async () => {
    const P = abrirJoan({ equipo_agregados: AGREGADOS, equipo_ya_existian: [{ celular: '3001112233', donde: 'base de OTRO' }] });
    P.ev('verYaExistianNuevos(40,43)'); await asentar();
    assert.deepEqual(llamadas(P, 'equipo_ya_existian')[0].args, { p_clave: 'clave-larga-de-prueba', p_cargas: [40, 43], p_solo_nuevos: true });
    P.ev('verYaExistian(41,42)'); await asentar();
    assert.deepEqual(llamadas(P, 'equipo_ya_existian')[1].args, { p_clave: 'clave-larga-de-prueba', p_cargas: [41, 42] });
  });

  /* 27-oct-2026, ronda 2 — ARRIBA DE BASES. La tarjeta queda debajo de la
     tabla de Prospectos (a 13.800 px en el PC con la base de Joan) y el ⛔ solo
     vivía ahí: Joan no se enteraba de que su gerente estaba parado. */
  test('el ⛔ del freno y lo que subió el equipo esta semana salen ARRIBA de Bases, antes de la tabla de Prospectos', async () => {
    const v = CRM.slice(CRM.indexOf('<section class="view" id="v-bases">'), CRM.indexOf('<section class="view" id="v-equipo">'));
    assert.ok(v.indexOf('id="avisoDelEquipo"') > 0 && v.indexOf('id="avisoDelEquipo"') < v.indexOf('id="kpiBases"'),
      'el aviso no está arriba, junto a los botones');
    assert.ok(v.indexOf('id="avisoDelEquipo"') < v.indexOf('id="tblProspectos"'));
    const d = aca(AGREGADOS);
    d.cargas[0].cuando = new Date(Date.now() - 86400000).toISOString();
    d.cargas[1].cuando = new Date(Date.now() - 30 * 86400000).toISOString();   // la de a mano, de hace un mes: no es de esta semana
    const P = abrirJoan({ equipo_agregados: d, equipo_soltar: { ok: true } });
    P.ev('pintarSubidoPorElEquipo()'); await asentar();
    const h = P.elems.avisoDelEquipo.innerHTML, t = plano(h);
    assert.match(t, /⛔ OTRO está parado desde el .*se le juntaron 61 celulares que ya existían/);
    assert.match(h, /onclick="soltarGerente\('3000000009'\)">Ya lo revisé: que siga<\/button>/);
    assert.match(h, /onclick="verYaExistianNuevos\(43\)">Ver cuáles<\/button>/);
    assert.match(t, /⤒ Tu equipo subió 244 personas esta semana \(WILLIAN\)\. Ver lo que subió tu equipo ↓/);
    assert.match(h, /onclick="verLoQueSubioElEquipo\(\);return false"/);
    /* Sin nada en la semana ni nadie parado, arriba no sale nada. */
    const Q = abrirJoan({ equipo_agregados: { cargas: [], frenados: [], por_gerente: [] } });
    Q.ev('pintarSubidoPorElEquipo()'); await asentar();
    assert.equal(Q.elems.avisoDelEquipo.innerHTML, '');
  });

  test('ver una carga y reasignar los marcados, también a «Nadie (soltarlo)»', async () => {
    const P = abrirJoan({ equipo_agregados: AGREGADOS, equipo_reasignar: { ok: true, movidos: 1, no_son_del_equipo: 0 },
      equipo_agregados_de: { total: 2, gente: [{ id: 'GP1', nombre: 'Ana', celular: '3200000001', nota: 'x', extra: { Barrio: 'Bosa' }, asesor_nombre: 'WILLIAN' },
        { id: 'GP2', nombre: 'Beto', celular: '3200000002', asesor_nombre: '' }] } });
    P.ev('pintarSubidoPorElEquipo()'); await asentar();
    P.ev('verCargaDelEquipo(41)'); await asentar();
    assert.deepEqual(llamadas(P, 'equipo_agregados_de')[0].args, { p_clave: 'clave-larga-de-prueba', p_cargas: [41, 42], p_desde: 0 });
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /<option value="nadie">Nadie \(soltarlo\)<\/option>/);
    assert.match(h, /LEIDY — asesor de WILLIAN/);
    assert.match(h, /WILLIAN — gerente/);
    P.ev("document.getElementById('deqChk_1').checked = " + JSON.stringify(true));
    P.ev("document.getElementById('deqDestino').value = " + JSON.stringify('nadie'));
    P.ev('asignarMarcadosDelEquipo()'); await asentar();
    assert.deepEqual(llamadas(P, 'equipo_reasignar')[0].args, { p_clave: 'clave-larga-de-prueba', p_personas: ['GP2'], p_asesor: '' });
    P.ev("document.getElementById('deqChk_0').checked = " + JSON.stringify(true)); P.ev("document.getElementById('deqDestino').value = " + JSON.stringify('3000000002'));
    P.ev('asignarMarcadosDelEquipo()'); await asentar();
    assert.equal(llamadas(P, 'equipo_reasignar')[1].args.p_asesor, '3000000002');
    assert.match(avisos(P), /Listo: 1 pasaron a LEIDY\. Les sale en su «Mi base»\./);
  });
});

describe('2 · «＋ Agregar prospecto» de Joan', () => {
  const llenar = (P, f) => { P.ctx._f = Object.assign({ apNombre: 'PEDRO PÉREZ', apCel: '3115550001', apOrigen: 'me lo recomendó Nancy', apAutoriza: 'si',
    apNota: 'vende en la plaza, llamarlo después de las 3' }, f || {}); P.ev("Object.keys(_f).forEach(function (k) { document.getElementById(k).value = _f[k]; })"); };

  test('la «Información adicional», justo después de «Celular», con la ayuda en sus tres estados', () => {
    const P = abrirJoan();
    P.ev('agregarProspecto()');
    const h = P.elems.mBody.innerHTML;
    assert.ok(h.indexOf('id="apCel"') < h.indexOf('id="apNota"') && h.indexOf('id="apNota"') < h.indexOf('id="apOrigen"'));
    assert.match(h, /<textarea id="apNota" rows="2" maxlength="300"/);
    assert.equal(P.ev('ayudaNotaProspecto()'), 'Lo que sirva para atenderlo. No escribas cédulas, direcciones, claves, deudas ni nada de salud, religión o política.');
    P.ev("_equipoAgrega = 'si'");
    assert.match(P.ev('ayudaNotaProspecto()'), /Si se lo asignas a alguien de tu equipo, también lo ve él\./);
    P.ev("_equipoAgrega = 'no'");
    assert.match(P.ev('ayudaNotaProspecto()'), /Por ahora solo la ves tú: falta correr el SQL del 27-oct en Supabase\./);
  });

  /* 27-oct-2026, revisión — el cuadro de 👤 decía que el equipo ve «su
     nombre, su celular y en qué va», y le llegan también la nota, las
     columnas, el origen y si autorizó. Sin el SQL (404) eso no viaja. */
  test('lo que ve el equipo, dicho completo; y la ayuda de «¿De dónde sale?» lo dice', () => {
    const P = abrirJoan();
    assert.match(P.ev("loQueVeElEquipo('prospecto')"), /^su nombre, su celular, en qué va y lo que anotaste de él: la información adicional, las columnas que guardaste de su base, de dónde salió y si autorizó\./);
    assert.match(P.ev("textoPublicarAsignar('Al asignarlo', 'prospecto')"), /de dónde salió y si autorizó/);
    P.ev('agregarProspecto()');
    assert.match(plano(P.elems.mBody.innerHTML), /tiene que existir antes, no después\. Si se lo asignas a alguien de tu equipo, también lo ve él\./);
    P.ev("_equipoAgrega = 'no'");
    assert.match(P.ev("loQueVeElEquipo('prospecto')"), /^su nombre, su celular y en qué va\./);
    P.ev('agregarProspecto()');
    assert.doesNotMatch(plano(P.elems.mBody.innerHTML), /también lo ve él/);
  });

  test('guarda la nota; pregunta al equipo EN ESE MOMENTO, y se niega con uno suyo o con uno que pidió que lo borraran', async () => {
    const P = abrirJoan({ equipo_tiene: a => (a.p_cels[0] === '3115550009'
      ? { '3115550009': { id: 'GP7', subido_por_nombre: 'WILLIAN', subido_en: '2026-10-30T15:00:00Z', lo_trabaja_nombre: 'LEIDY' } }
      : a.p_cels[0] === '3115550008' ? { '3115550008': { no_contactar: true, desde: '2026-11-03T10:00:00Z' } } : {}),
      equipo_publicar_celulares: { ok: true } });
    P.ev('agregarProspecto()'); llenar(P);
    const r = await P.ev('guardarProspectoSuelto()'); await asentar();
    assert.equal(r, 'agregado');
    const p = aca(P.ev("prospectos().find(function (x) { return x.celular === '3115550001'; })"));
    assert.equal(p.nota, 'vende en la plaza, llamarlo después de las 3');
    assert.deepEqual(llamadas(P, 'equipo_tiene')[0].args, { p_clave: 'clave-larga-de-prueba', p_cels: ['3115550001'] });
    assert.ok(llamadas(P, 'equipo_publicar_celulares').length >= 1, 'sus celulares no subieron');
    P.ev('agregarProspecto()'); llenar(P, { apCel: '3115550009' });
    assert.equal(await P.ev('guardarProspectoSuelto()'), 'del_equipo');
    assert.match(avisos(P), /Ese celular ya lo subió WILLIAN el 30-oct \(lo trabaja LEIDY\)\. No lo agrego dos veces: lo ves en Bases → «⤒ Lo que subió tu equipo»/);
    P.ev('agregarProspecto()'); llenar(P, { apCel: '3115550008' });
    assert.equal(await P.ev('guardarProspectoSuelto()'), 'no_contactar');
    assert.match(avisos(P), /Esa persona pidió que la borraran el 3-nov\. No la agrego\./);
    assert.equal(P.ev("prospectos().filter(function (x) { return /311555000[89]/.test(x.celular); }).length"), 0);
  });

  test('si no pudo mirar, lo agrega y lo dice; con 404, lo agrega callado', async () => {
    const P = abrirJoan({ equipo_tiene: { falla: 'No hubo conexión con la nube.' } });
    P.ev('agregarProspecto()'); llenar(P);
    await P.ev('guardarProspectoSuelto()'); await asentar();
    assert.match(avisos(P), /No pude mirar si tu equipo ya lo tenía\. Antes de mandárselo a alguien lo vuelvo a mirar\./);
    /* Sin el SQL, TODAS las funciones nuevas contestan 404 (vienen en el mismo archivo). */
    const Q = abrirJoan({ equipo_tiene: FALTA, equipo_publicar_celulares: FALTA, equipo_agregados: FALTA });
    Q.ev('agregarProspecto()'); llenar(Q);
    await Q.ev('guardarProspectoSuelto()'); await asentar();
    assert.doesNotMatch(avisos(Q), /No pude mirar/);
    assert.equal(Q.ev("_equipoAgrega"), 'no');
  });

  test('la fila de Bases pinta la nota y el extra; el buscador los encuentra', () => {
    const P = abrirJoan();
    P.ev('renderBases()');
    const t = plano(P.elems.tblProspectos.innerHTML);
    assert.match(t, /📝 «tiene una tienda» Barrio: Suba/);
    assert.equal(P.ev("coincideProspecto(prospectos()[1], 'suba')"), true);
    assert.equal(P.ev("coincideProspecto(prospectos()[1], 'tienda')"), true);
    assert.equal(P.ev("coincideProspecto(prospectos()[0], 'suba')"), false);
  });
});

describe('3 · «⤒ Cargar base» de Joan: las columnas extra', () => {
  const CSV = 'Nombre;Celular;Barrio;Saldo\r\nANA GOMEZ PEREZ;3209000001;Kennedy;200000\r\nLUZ ROJAS RUIZ;3209000002;Bosa;0\r\nJOSE PARDO NIÑO;3209000003;Suba;50000';
  test('se ofrecen sin marcar; solo lo marcado se guarda; pesan; y lo del equipo cuenta como «ya era prospecto»', async () => {
    const P = abrirJoan({ equipo_tiene: { '3209000003': { id: 'GP5', subido_por_nombre: 'WILLIAN' } }, equipo_publicar_celulares: { ok: true } });
    P.ctx._f = { name: 'feria.csv', text: () => Promise.resolve(CSV) };
    P.ev('leerArchivoBase(_f)'); await asentar();
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /<input type="checkbox" id="exCol_0">/);
    assert.doesNotMatch(h, /checked/);
    assert.match(plano(h), /No se guardan: Saldo \(es plata o deuda\)/);
    assert.match(plano(h), /De esos, ya los subió tu equipo 1/);
    assert.equal(P.ev('_baseLeida.revision.nuevos.length'), 2, 'el que subió el equipo entró como nuevo');
    /* espacioParaBase pesa la información adicional que se podría guardar. */
    const conExtra = P.ev('_baseLeida.espacio.porCopia');
    P.ev('_baseLeida.extra = { columnas: [], descartadas: [] }; var _sin = espacioParaBase(_baseLeida).porCopia;');
    assert.ok(conExtra > P.ev('_sin'), 'el peso no cuenta la información adicional');
    P.ev('_baseLeida.extra = AgregarProspectos.columnasExtra(_baseLeida.filas, _baseLeida.cols)');
    P.ev("document.getElementById('exCol_0').checked = " + JSON.stringify(true));
    P.ev("document.getElementById('baseOrigen').value = " + JSON.stringify('Feria de Kennedy'));
    P.ev('confirmarCargaBase()'); await asentar();
    const ps = aca(P.ev("prospectos().filter(function (x) { return x.base === 'feria.csv'; })"));
    assert.equal(ps.length, 2);
    assert.deepEqual(ps[0].extra, { Barrio: 'Kennedy' });
    assert.ok(llamadas(P, 'equipo_publicar_celulares').length >= 1);
  });
});

describe('4 · lo de Joan no pisa ni duplica lo del equipo', () => {
  test('Repartir salta los que ya subió el equipo, y lo dice', async () => {
    const P = abrirJoan({ equipo_tiene: { '3001110001': { id: 'GP9', subido_por_nombre: 'WILLIAN' } } });
    await P.ev("equipoTiene(['3001110001','3001110002'])");
    assert.equal(P.ev('yaLoSubioElEquipo("P1-0")'), true);
    P.ev("asignarUno('prospecto','P1-0')");
    assert.match(avisos(P), /No se lo asigno: ese celular ya lo subió tu equipo/);
    P.ev("_modoAsignar = 'marcar'; _todosMarcados = true; _asignables = [{ id: 'P1-0' }, { id: 'P1-1' }]; _grupoAsignar = 'potenciales'");
    P.ev("document.getElementById('asDestino').value = 'a1'");
    P.ev('asignarMarcados()'); await asentar();
    assert.match(avisos(P), /No se los asigné a 1: ya los subió tu equipo/);
    assert.equal(P.ev("asignaciones().some(function (a) { return a.socio_id === 'P1-0'; })"), false);
    assert.equal(P.ev("asignaciones().some(function (a) { return a.socio_id === 'P1-1'; })"), true);
  });

  test('LA COMPUERTA: publicar no manda a la gente del equipo ni a quien pidió que lo borraran', async () => {
    const C = aca(CARTERA);
    C.asignaciones = [{ id: 'A1', socio_id: 'P1-0', asesor_id: 'a1', desde: HOY }, { id: 'A2', socio_id: 'P1-1', asesor_id: 'a1', desde: HOY },
      { id: 'A3', socio_id: 'P1-2', asesor_id: 'a1', desde: HOY }];
    const P = abrirJoan({ equipo_tiene: { '3001110001': { id: 'GP9' }, '3001110003': { no_contactar: true } },
      equipo_publicar: { ok: true, equipo: 3 }, equipo_publicar_info: { ok: true }, equipo_publicar_celulares: { ok: true } }, C);
    const r = P.ev('armarPublicacionEquipo()');
    await P.ev("publicarEquipoAhora(equipo().filter(function (p) { return p.celular; }), armarPublicacionEquipo().asig, armarPublicacionEquipo().ps, { auto: true })");
    await asentar();
    assert.equal(r.ps.length, 3);
    const pub = llamadas(P, 'equipo_publicar')[0].args;
    assert.deepEqual(pub.p_gente.map(x => x.id), ['P1-1']);
    assert.deepEqual(pub.p_asignaciones.map(x => x.persona_id), ['P1-1']);
    assert.match(P.ev('htmlSubidoPorElEquipo.toString()'), /No publiqué a/);
    assert.equal(P.ev('_noPublicadosPorEquipo'), 2);
    /* Y la información de Joan viaja (solo la que tiene nota, extra u origen). */
    await asentar();
    const info = llamadas(P, 'equipo_publicar_info');
    assert.equal(info.length, 1);
    assert.deepEqual(info[0].args.p_info, [{ id: 'P1-1', nota: 'tiene una tienda', extra: { Barrio: 'Suba' }, origen: 'pauta de Facebook', autoriza: null,
      creado: '2026-09-26' }]);
  });

  /* 27-oct-2026, revisión — SI JOAN CAMBIA «AUTORIZÓ», LE LLEGA AL EQUIPO. Se
     mandaba una vez por sesión y el servidor no la volvía a escribir: la
     revocatoria no llegaba nunca a quien escribe. */
  test('el «Sí» o «No» de Comercial viaja en ese momento, en los dos sentidos; sin repartir, no', async () => {
    const C = aca(CARTERA);
    C.asignaciones = [{ id: 'A1', socio_id: 'P1-0', asesor_id: 'a1', desde: HOY }];
    C.prospectos[0].autorizaInvitacion = true;
    const P = abrirJoan({ equipo_publicar_info: { ok: true, guardadas: 0, cambiadas: 1, ya_tenian: 0, sin_fila: 0 } }, C);
    await P.ev("publicarInfoDeProspectos([{ id: 'P1-0', tipo: 'prospecto' }])");
    assert.equal(llamadas(P, 'equipo_publicar_info')[0].args.p_info[0].autoriza, true);
    await P.ev("publicarInfoDeProspectos([{ id: 'P1-0', tipo: 'prospecto' }])");
    assert.equal(llamadas(P, 'equipo_publicar_info').length, 1, 'mandó otra vez lo mismo');
    P.ev("autorizarProspecto('P1-0', false)"); await asentar();
    const l = llamadas(P, 'equipo_publicar_info');
    assert.equal(l.length, 2, 'el «No» de Comercial no viajó');
    assert.equal(l[1].args.p_info[0].autoriza, false);
    assert.equal(l[1].args.p_info[0].creado, '2026-09-26');
    P.ev("autorizarProspecto('P1-0', true)"); await asentar();
    assert.equal(llamadas(P, 'equipo_publicar_info')[2].args.p_info[0].autoriza, true, 'el «Sí» de después no viajó');
    /* Alguien que no está repartido no está en la nube: no se manda nada. */
    P.ev("autorizarProspecto('P1-1', true)"); await asentar();
    assert.equal(llamadas(P, 'equipo_publicar_info').length, 3);
    /* Un «Sí» o «No» sin nota ni origen también viaja. */
    assert.ok(P.ev("publicarInfoDeProspectos.toString()").indexOf("typeof p.autorizaInvitacion !== 'boolean'") > 0);
  });

  test('la fecha de carga: la de cargadoEn, o la del id P<ms>; si no hay, vacía (la nube no inventa una)', () => {
    const P = abrirJoan();
    assert.equal(P.ev("fechaDeCargaProspecto({ id: 'P1', cargadoEn: '2026-09-26' })"), '2026-09-26');
    const ms = new Date(2026, 8, 3, 10, 0, 0).getTime();
    assert.equal(P.ev("fechaDeCargaProspecto({ id: 'P" + ms + "-4' })"), '2026-09-03');
    assert.equal(P.ev("fechaDeCargaProspecto({ id: 'X-1' })"), '');
  });

  /* 27-oct-2026, ronda 2 — LOS CELULARES DE JOAN SUBEN AL ENTRAR. Solo subían al
     publicar, cargar o agregar: con el SQL recién corrido y nada que publicar,
     un gerente podía quedarse con un prospecto de Joan sin repartir. */
  test('al abrir el CRM, los celulares de Joan suben solos (a los 20 s) y después cada 15 min solo los nuevos', async () => {
    const P = abrirJoan({ equipo_publicar_celulares: { ok: true } });
    P.ctx._timers = [];
    P.ev('setTimeout = function (f, ms) { _timers.push({ f: f, ms: ms, una: true }); return 1; };' +
         ' setInterval = function (f, ms) { _timers.push({ f: f, ms: ms }); return 2; };');
    P.ev('arrancarPublicarSolo()');
    const t20 = P.ctx._timers.find(t => t.una && t.ms === 20000);
    assert.ok(t20, 'no programó la subida de los celulares al entrar');
    t20.f(); await asentar();
    assert.deepEqual(llamadas(P, 'equipo_publicar_celulares').map(x => x.args.p_cels.length), [3]);
    const cada15 = P.ctx._timers.find(t => !t.una);
    P.ev("prospectos().push({ id: 'PN', nombre: 'Nuevo', celular: '3159999998', estado: 'nuevo' })");
    P.ev('publicarEquipoSolo = function () { return Promise.resolve(\'x\'); }');
    cada15.f(); await asentar();
    assert.deepEqual(llamadas(P, 'equipo_publicar_celulares')[1].args.p_cels, ['3159999998']);
  });

  /* 27-oct-2026, ronda 2 — lo que Joan acepta al publicar decía que la
     dirección no viaja y no mencionaba la información de los potenciales. */
  test('la confirmación de «Publicar» dice que de los potenciales viaja lo que anotaste; con 404, no', async () => {
    const C = aca(CARTERA);
    C.asignaciones = [{ id: 'A2', socio_id: 'P1-1', asesor_id: 'a1', desde: HOY }];
    const P = abrirJoan({ equipo_tiene: {}, equipo_publicar: { ok: true } }, C);
    P.ev('confirm = function (m) { _avisos.push(\'¿\' + m); return false; }');
    await P.ev("publicarEquipoAhora(equipo().filter(function (p) { return p.celular; }), armarPublicacionEquipo().asig, armarPublicacionEquipo().ps)");
    const t = avisos(P).replace(/\n/g, ' ');
    assert.match(t, /Sigue sin viajar: cédula, dirección, fotos y referencias\./);
    assert.match(t, /De los potenciales viaja además lo que anotaste de ellos: la información adicional .*las columnas que marcaste al cargar su base, de dónde salió y si autorizó\./);
    assert.equal(llamadas(P, 'equipo_publicar').length, 0);
    const Q = abrirJoan({ equipo_tiene: {} }, C);
    Q.ev("_equipoAgrega = 'no'; confirm = function (m) { _avisos.push('¿' + m); return false; }");
    await Q.ev("publicarEquipoAhora(equipo().filter(function (p) { return p.celular; }), armarPublicacionEquipo().asig, armarPublicacionEquipo().ps)");
    assert.doesNotMatch(avisos(Q), /De los potenciales viaja además/);
  });

  test('publicarCelularesDeJoan: la primera vez todos (de 5.000 en 5.000), después solo los nuevos', async () => {
    const C = aca(CARTERA);
    for (let i = 0; i < 5100; i++) C.prospectos.push({ id: 'PX-' + i, nombre: 'X', celular: String(3100000000 + i), estado: 'nuevo' });
    const P = abrirJoan({ equipo_publicar_celulares: { ok: true } }, C);
    await P.ev('publicarCelularesDeJoan()');
    const l = llamadas(P, 'equipo_publicar_celulares');
    assert.deepEqual(l.map(x => x.args.p_cels.length), [5000, 103]);
    P.ev("prospectos().push({ id: 'PN', nombre: 'Nuevo', celular: '3159999999', estado: 'nuevo' })");
    await P.ev('publicarCelularesDeJoan()');
    assert.deepEqual(llamadas(P, 'equipo_publicar_celulares')[2].args.p_cels, ['3159999999']);
  });
});

describe('5 · REGRESIÓN DE LA SONDA (2): el gerente reasigna y Joan ya no lo deshace', () => {
  /* A1 (de Joan, a WILLIAN) cambiada en la nube a LEIDY por asignar_a, que
     conserva el id (on conflict (persona_id, desde) do update set asesor). */
  function conA1(desde) {
    const C = aca(CARTERA);
    C.asignaciones = [{ id: 'A1', socio_id: 'P1-0', asesor_id: 'g1', desde }];
    return abrirJoan({ equipo_traer: { equipo: [], contactos: [],
      asignaciones: [{ id: 'A1', persona_id: 'P1-0', asesor: '3000000002', desde }] } }, C);
  }
  const vaA = P => P.ev("armarPublicacionEquipo().asig.filter(function (a) { return a.persona_id === 'P1-0'; }).map(function (a) { return a.asesor; })");

  [['hoy', HOY], ['hace 7 días', HACE7]].forEach(([nombre, desde]) => {
    test('con la fecha de la nube (' + nombre + '): entra una fila NUEVA con LEIDY, A1 queda igual, y se publica LEIDY', async () => {
      const P = conA1(desde);
      await P.ev('traerEquipo(true)'); await asentar();
      const as = aca(P.ev("asignaciones().filter(function (a) { return a.socio_id === 'P1-0'; })"));
      assert.equal(as.length, 2);
      assert.deepEqual(as[0], { id: 'A1', socio_id: 'P1-0', asesor_id: 'g1', desde }, 'cambió la fila que ya existía');
      assert.equal(as[1].asesor_id, 'a1');
      assert.equal(as[1].desde, desde);
      assert.deepEqual(aca(vaA(P)), ['3000000002'], 'la publicación de Joan deshace lo del gerente');
      assert.equal(P.ev("armarPublicacionEquipo().asig.filter(function (a) { return a.persona_id === 'P1-0'; })[0].id"), 'A1');
    });
  });

  test('con una marca pendiente de Joan para esa llave, gana Joan', async () => {
    const P = conA1(HOY);
    P.ev("anotarAsigPorPublicar('P1-0', '" + HOY + "')");
    await P.ev('traerEquipo(true)'); await asentar();
    assert.deepEqual(aca(vaA(P)), ['3000000000']);
  });

  test('después de fusionar con otro aparato (nube.js), sigue mandando LEIDY', async () => {
    const P = conA1(HOY);
    await P.ev('traerEquipo(true)'); await asentar();
    const mias = aca(P.ev('asignaciones()'));
    const suyas = [{ id: 'A1', socio_id: 'P1-0', asesor_id: 'g1', desde: HOY }];
    P.ctx._fusion = P.ctx.NubeTuGarantia.fusionarListas(suyas, mias, ['socio_id', 'asesor_id', 'desde', 'id']);
    P.ev('DB.asignaciones = _fusion');
    assert.deepEqual(aca(vaA(P)), ['3000000002']);
  });

  /* 27-oct-2026, revisión — LA PUBLICACIÓN DE VERDAD, de punta a punta. La
     prueba de arriba miraba armarPublicacionEquipo DESPUÉS de traer, pero
     publicarEquipo y publicarEquipoSolo armaban ANTES: se seguía mandando
     WILLIAN, LEIDY lo perdía, y en la vuelta siguiente oscilaba. */
  [['publicarEquipo (el botón)', 'publicarEquipo()'], ['publicarEquipoSolo (un cambio de Joan)', 'publicarEquipoSolo({ porCambio: true })']].forEach(([nombre, llamar]) => {
    test(nombre + ': lo que viaja es LEIDY, y la segunda vuelta no suma nada ni oscila', async () => {
      const C = aca(CARTERA);
      C.asignaciones = [{ id: 'A1', socio_id: 'P1-0', asesor_id: 'g1', desde: HOY }];
      const P = abrirJoan({ equipo_traer: { equipo: [], contactos: [], asignaciones: [{ id: 'A1', persona_id: 'P1-0', asesor: '3000000002', desde: HOY }] },
        gestiones_listar: [], equipo_tiene: {}, equipo_publicar: { ok: true, equipo: 3, asignaciones: 1, gente: 1 },
        equipo_publicar_info: { ok: true }, equipo_publicar_celulares: { ok: true } }, C);
      /* CONTROL: lo armado ANTES de traer —lo que mandaba la versión de antes— dice WILLIAN. */
      assert.deepEqual(aca(P.ev("armarPublicacionEquipo().asig.filter(function (a) { return a.persona_id === 'P1-0'; }).map(function (a) { return a.asesor; })")), ['3000000000']);
      const vaA = n => llamadas(P, 'equipo_publicar')[n].args.p_asignaciones.filter(a => a.persona_id === 'P1-0').map(a => a.asesor);
      P.ev('guardar()');   // como al repartir: guardar() sella la cartera de esta pestaña (si no, «cartera_ajena»)
      await P.ev(llamar); await asentar(60);
      assert.equal(llamadas(P, 'equipo_publicar').length, 1, 'no publicó');
      assert.deepEqual(vaA(0), ['3000000002'], 'la publicación de Joan le quita a LEIDY lo que le dio el gerente');
      const n = P.ev("asignaciones().filter(function (a) { return a.socio_id === 'P1-0'; }).length");
      await P.ev(llamar); await asentar(60);
      assert.deepEqual(vaA(1), ['3000000002'], 'en la segunda vuelta osciló');
      assert.equal(P.ev("asignaciones().filter(function (a) { return a.socio_id === 'P1-0'; }).length"), n, 'cada vuelta suma una asignación');
    });
  });

  /* 27-oct-2026, revisión — LAS MARCAS DE REPARTIR. Cada una leía, parseaba
     y escribía el mapa ENTERO en localStorage: 6.000 tardaban 22 s y dejaban
     400.000 caracteres antes de guardar(). */
  test('6.000 marcas: en un instante, sin tocar localStorage; al disco solo si la publicación falla, y compactas', () => {
    const P = abrirJoan();
    const escritos = [];
    const set = P.ctx.localStorage.setItem;
    P.ctx.localStorage.setItem = (k, v) => { escritos.push(k); return set(k, v); };
    const t0 = Date.now();
    P.ev("for (var i = 0; i < 6000; i++) anotarAsigPorPublicar('P1729000000000-' + i, '" + HOY + "')");
    const ms = Date.now() - t0;
    assert.ok(ms < 2000, '6.000 marcas tardaron ' + ms + ' ms');
    assert.deepEqual(escritos.filter(k => k === 'tg_asig_por_publicar'), [], 'escribió las marcas en localStorage al anotarlas');
    assert.equal(P.ev("hayAsigPorPublicar('P1729000000000-5|" + HOY + "')"), true);
    const salen = P.ev('leerAsigPorPublicar()');
    P.ev('guardarAsigPorPublicar()');   // lo que hace una publicación que falla
    const disco = P.almacen.tg_asig_por_publicar;
    assert.ok(disco && disco.length / 6000 < 45, 'cada marca ocupa ' + (disco ? disco.length / 6000 : 0) + ' caracteres');
    P.ev('soltarAsigPublicadas(' + JSON.stringify(salen) + ')');
    assert.equal(P.almacen.tg_asig_por_publicar, undefined, 'las soltadas siguen en el disco');
    assert.equal(P.ev("hayAsigPorPublicar('P1729000000000-5|" + HOY + "')"), false);
  });

  /* 27-oct-2026, ronda 2 — LA FILA NUEVA DEL GERENTE (G…). asignar_a escribe
     con su propio id; si Joan reasignó ese día antes de traerla, la fila del
     gerente se sumaba DETRÁS de la de Joan, ganaba «la última del día», se
     publicaba esa, y Joan leía «queda con OTRO» mientras quedaba con LEIDY. */
  [['publicarEquipo (el botón)', 'publicarEquipo()'], ['publicarEquipoSolo (un cambio de Joan)', 'publicarEquipoSolo({ porCambio: true })']].forEach(([nombre, llamar]) => {
    test(nombre + ': el gerente le pasó a P1-0 a LEIDY con una fila NUEVA y Joan se lo pasa a OTRO antes de traerla: gana Joan, con el id de la nube', async () => {
      const C = aca(CARTERA);
      C.asignaciones = [{ id: 'A1', socio_id: 'P1-0', asesor_id: 'g1', desde: HACE7 }];
      const nube = [{ id: 'A1', persona_id: 'P1-0', asesor: '3000000000', desde: HACE7 },
        { id: 'G20261027200000000-0', persona_id: 'P1-0', asesor: '3000000002', desde: HOY }];
      const P = abrirJoan({ equipo_traer: { equipo: [], contactos: [], asignaciones: nube },
        gestiones_listar: [], equipo_tiene: {}, equipo_publicar: { ok: true, equipo: 3, asignaciones: 1, gente: 1 },
        equipo_publicar_info: { ok: true }, equipo_publicar_celulares: { ok: true } }, C);
      /* Joan, sin haber traído lo del gerente: P1-0 → OTRO (g2), hoy. */
      assert.equal(P.ev("anotarAsignacion('P1-0', 'g2', '" + HOY + "', 'A2')"), HOY);
      P.ev('guardar()');
      await P.ev(llamar); await asentar(60);
      const pub = llamadas(P, 'equipo_publicar');
      assert.equal(pub.length, 1, 'no publicó');
      const deHoy = pub[0].args.p_asignaciones.filter(a => a.persona_id === 'P1-0' && a.desde === HOY);
      assert.deepEqual(deHoy.map(a => [a.id, a.asesor]), [['G20261027200000000-0', '3000000009']],
        'la publicación de Joan dejó al gerente ganar, o no usó el id de la nube');
      /* El dueño de hoy en ESTE computador (la última del día) también es OTRO. */
      assert.equal(P.ev("asignaciones().filter(function (a) { return a.socio_id === 'P1-0' && a.desde === '" + HOY + "'; }).pop().asesor_id"), 'g2', 'el CRM de Joan dice otro dueño');
    });
  });

  /* 27-oct-2026, ronda 2 — con la huella quieta, la vuelta de 15 min no traía
     nada: lo que el gerente reasignaba durante el día no llegaba al CRM de Joan
     hasta que Joan tocaba algo, y Joan decidía sobre una vista vieja. */
  test('la vuelta de 15 min sin nada que publicar TRAE lo del gerente igual', async () => {
    const C = aca(CARTERA);
    C.asignaciones = [{ id: 'A1', socio_id: 'P1-0', asesor_id: 'g1', desde: HACE7 }];
    const nube = { equipo: [], contactos: [], asignaciones: [{ id: 'A1', persona_id: 'P1-0', asesor: '3000000000', desde: HACE7 }] };
    const P = abrirJoan({ equipo_traer: () => nube, gestiones_listar: [], equipo_tiene: {},
      equipo_publicar: { ok: true, equipo: 3, asignaciones: 1, gente: 1 }, equipo_publicar_info: { ok: true }, equipo_publicar_celulares: { ok: true } }, C);
    P.ev("window.NubeCRM = { estado: function () { return { fase: 'lista' }; }, libroAlDiaEsperando: function () { return Promise.resolve({ ok: true, motivo: 'al-dia' }); } }");
    P.ev('guardar()');
    assert.equal(await P.ev('publicarEquipoSolo()'), 'publicado');
    await asentar(60);
    /* 10:00 — el gerente se lo pasa a LEIDY (fila nueva). 10:15 — la vuelta de Joan, sin nada que publicar. */
    nube.asignaciones.push({ id: 'G1-0', persona_id: 'P1-0', asesor: '3000000002', desde: HOY });
    const antes = llamadas(P, 'equipo_traer').length;
    assert.equal(await P.ev('publicarEquipoSolo()'), 'sin_cambios');
    await asentar(60);
    assert.equal(llamadas(P, 'equipo_traer').length, antes + 1, 'la vuelta sin cambios no trajo nada');
    assert.equal(P.ev("asignaciones().filter(function (a) { return a.socio_id === 'P1-0' && a.desde === '" + HOY + "'; }).pop().asesor_id"), 'a1', 'el CRM de Joan sigue diciendo el dueño de antes');
  });

  test('CONTROL: sin laNubeCambioElAsesor, la misma prueba manda WILLIAN (el defecto que se arregló)', async () => {
    const P = conA1(HOY);
    P.ev('laNubeCambioElAsesor = function () { return false; }');
    await P.ev('traerEquipo(true)'); await asentar();
    assert.deepEqual(aca(vaA(P)), ['3000000000'], 'la prueba no ve el defecto');
  });
});

describe('6 · lo del equipo (GP…) no entra a este navegador ni se republica', () => {
  test('traerEquipo no trae sus asignaciones ni sus contactos; traerGestiones, tampoco sus gestiones', async () => {
    const P = abrirJoan({
      equipo_traer: { equipo: [], asignaciones: [{ id: 'GA1-0', persona_id: 'GP1-0', asesor: '3000000002', desde: HOY },
        { id: 'A9', persona_id: 'P1-1', asesor: '3000000002', desde: HOY }],
        contactos: [{ id: 'c1', persona_id: 'GP1-0', quien: '3000000002' }, { id: 'c2', persona_id: 'P1-1', quien: '3000000002' }] },
      gestiones_listar: [{ id: 'g1', persona_id: 'GP1-0', tipo: 'no_contesta' }, { id: 'g2', persona_id: 'P1-1', tipo: 'no_contesta' }] });
    await P.ev('traerEquipo(true)'); await P.ev('traerGestiones(true)'); await asentar();
    assert.deepEqual(aca(P.ev('asignaciones().map(function (a) { return a.socio_id; })')), ['P1-1']);
    assert.deepEqual(aca(P.ev('contactos().map(function (c) { return c.persona_id; })')), ['P1-1']);
    assert.deepEqual(aca(P.ev('gestiones().map(function (g) { return g.persona_id; })')), ['P1-1']);
  });

  test('armarPublicacionEquipo no manda asignaciones GP… aunque una pestaña vieja las haya importado', () => {
    const C = aca(CARTERA);
    C.asignaciones = [{ id: 'GA1-0', socio_id: 'GP1-0', asesor_id: 'a1', desde: HOY }, { id: 'A2', socio_id: 'P1-1', asesor_id: 'a1', desde: HOY }];
    const P = abrirJoan({}, C);
    assert.deepEqual(aca(P.ev('armarPublicacionEquipo().asig.map(function (a) { return a.persona_id; })')), ['P1-1']);
  });
});

describe('7 · 📥 Registrados y «🚫 Borrar a alguien que lo pidió»', () => {
  test('el chip: «Lo subió WILLIAN el 30-oct · lo trabaja LEIDY · sin gestión anotada antes de registrarse»', async () => {
    const P = abrirJoan({ equipo_tiene: { '3207770001': { id: 'GP1', subido_por_nombre: 'WILLIAN', subido_en: '2026-10-30T15:00:00Z',
      lo_trabaja_nombre: 'LEIDY', gestion_antes_del_registro: false } } });
    P.ev("_registros = [{ id: 7, nombre: 'Rosa', telefono: '3207770001', cedula: '1', origen: 'abierto', creado_en: '2026-10-31T10:00:00Z', datos: {}, estado: 'nuevo' }]");
    P.ev('renderRegistros()'); await asentar();
    P.ev('renderRegistros()');
    const t = plano(P.elems.tblRegistros.innerHTML);
    assert.match(t, /Lo subió WILLIAN el 30-oct · lo trabaja LEIDY · sin gestión anotada antes de registrarse · asígnalo antes de desembolsar/);
    assert.equal(llamadas(P, 'equipo_tiene').length, 1);
  });

  test('borrar: el cuadro, la confirmación, equipo_suprimir, y también de los prospectos de este computador', async () => {
    const P = abrirJoan({ equipo_suprimir: { ok: true, es_cliente: false, del_equipo: 1, de_joan: 1 }, equipo_agregados: AGREGADOS });
    P.ev('suprimirDesdeBases()');
    assert.equal(P.elems.mTitle.textContent, '🚫 ¿Quién pidió que lo borraran?');
    P.ev("document.getElementById('supCel').value = " + JSON.stringify('3001110002')); P.ev("document.getElementById('supComo').value = " + JSON.stringify('por el chat de la app el 3-nov'));
    P.ev('confirmarSuprimir()'); await asentar();
    assert.match(avisos(P), /¿Voy a borrar de la nube a esta persona como prospecto .*No se puede deshacer\./);
    assert.deepEqual(llamadas(P, 'equipo_suprimir')[0].args, { p_clave: 'clave-larga-de-prueba', p_celular: '3001110002', p_como: 'por el chat de la app el 3-nov' });
    assert.match(avisos(P), /Listo: borré 1 que subió tu equipo y 1 tuyas de la nube\. Ese número ya no se puede volver a agregar\./);
    assert.match(avisos(P), /También lo quité de tus prospectos de este computador\./);
    /* 27-oct-2026, ronda 2 — y de la copia del Panel en la nube; lo de otro aparato se dice. */
    assert.match(avisos(P), /¿Voy a borrar de la nube .*la copia de tu Panel en la nube/);
    assert.match(avisos(P), /También la quité de la copia de tu Panel en la nube, y la nube no la vuelve a guardar aunque otro aparato tuyo la suba\. Si tienes el Panel en otro aparato \(el celular\), allá sigue en tus prospectos hasta que la borres a mano\./);
    assert.match(avisos(P), /Lo que tu equipo ya le escribió por WhatsApp queda en sus teléfonos/);
    assert.equal(P.ev("prospectos().some(function (p) { return p.celular === '3001110002'; })"), false);
  });

  test('a un cliente no se le borra nada: solo se anota', async () => {
    const P = abrirJoan({ equipo_suprimir: { ok: true, es_cliente: true } });
    P.ev('suprimirDesdeBases()');
    P.ev("document.getElementById('supCel').value = " + JSON.stringify('3001110001')); P.ev("document.getElementById('supComo').value = " + JSON.stringify('llamó a la oficina'));
    P.ev('confirmarSuprimir()'); await asentar();
    assert.match(avisos(P), /Es cliente: lo que la ley obliga a guardar \(créditos y pagos\) no se borra\. Habla con el abogado/);
    assert.equal(P.ev("prospectos().some(function (p) { return p.celular === '3001110001'; })"), true);
  });
});
