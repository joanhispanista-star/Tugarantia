'use strict';
/* ============================================================================
 * LA PROPUESTA QUINCENAL A CUOTAS — 13 de noviembre de 2026
 *
 *   node --test pruebas/propuesta-a-cuotas.test.js
 *
 * Joan, con el pantallazo de un cliente nuevo que pidió $2.000.000 a 79 días:
 * «al momento de hacer la contrapropuesta no me permite la opción de cuotas y
 * elegir el número de cuotas y las fechas, solo me lo permite con créditos con
 * garantía; habilita esta opción lo antes posible para enviar una
 * contrapropuesta del crédito a cuotas y con los porcentajes que yo quiera».
 *
 * De punta a punta, con el CRM de verdad (banco-panel.js), el motor, el
 * puente y app/calculadora-solicitud.js:
 *
 *   1. «Proponer» tiene tres formas, y la nueva da EXACTAMENTE lo mismo que el
 *      registro a cuotas de 📊 Créditos con las mismas entradas (paridad):
 *      las reglas de Joan del 16-17 oct son UNAS, las del motor;
 *   2. los límites apagan el botón: 1 y 7 cuotas, 187 días, el % sobre el
 *      techo, la primera fecha en el pasado (y hoy: el motor la quiere
 *      después del desembolso);
 *   3. «Un solo pago» y «Con garantía · mensual» mandan lo mismo que antes;
 *   4. la app del cliente la lee en pesos, con la garantía del quincenal
 *      cuota por cuota y el recargo sobre el capital de la cuota;
 *   5. la constancia lleva las cuotas y el CRM las coteja sin descuadres
 *      falsos;
 *   6. desembolsarla registra el mismo crédito que el registro a cuotas, con
 *      lo aceptado, o no registra nada;
 *   7. la ficha y 📨 Solicitudes la dicen en una línea.
 *
 * El reloj va congelado en el viernes 13-nov-2026 (`ahora`): las fechas de
 * partida, la primera cuota y la E.A. dependen del día. El 15-nov-2026 es
 * domingo y el 16 festivo, y el 31-ene-2027 domingo.
 * Los nombres y los celulares son de mentira.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const M = require(path.join(RAIZ, 'app', 'motor.js'));
const PU = require(path.join(RAIZ, 'app', 'puente.js'));
const CS = require(path.join(RAIZ, 'app', 'calculadora-solicitud.js'));
const C = require(path.join(RAIZ, 'app', 'creditos.js'));

const AHORA = '2026-11-13T10:00:00';
const HOY = '2026-11-13';
const CEL = '3001230099';
const CLAVE = 'clave-de-prueba-bien-larga';
const plano = h => String(h || '').replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* El caso de Joan: pidió 2.000.000 para el 31-ene-2027 (79 días). */
const FICHA = () => ({ id: 'C700', numero: 70, nombre: 'Ana Prueba', telefono: CEL, whatsappIgual: true,
  referencia: { nombre: '', telefono: '' }, gestiones: [], fechaRegistro: '2026-11-10T10:00:00Z', origen: 'registro_abierto' });
const PIDE = () => ({ id: 77, nombre: 'Ana Prueba', cedula: CEL, celular: CEL, estado: 'nueva', app: 'tugarantia', origen: 'nube',
  capital: 2000000, pedido_monto: 2000000, producto: 'quincenal', registro_id: 66, fecha_corte: '2027-01-31',
  pedido: { origen: 'play', capital: 2000000, fecha_pago: '2027-01-31', dias: 79, pedida_en: '2026-11-13T14:00:00Z' },
  contrapropuesta: null, datos: {} });
const ENTRADAS = [{ fecha: '2026-11-30', pct: 20 }, { fecha: '2026-12-15', pct: 15 }, { fecha: '2027-01-31', pct: 10 }];

/* La nube de mentira: anota cada rpc, y contesta ok. */
function crm(o) {
  o = o || {};
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    let cuerpo = null; try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ fn, cuerpo });
    if (o.sinFuncion && fn === o.sinFuncion) return Promise.resolve(resp(404, { message: 'no existe' }));
    if (/^listar_/.test(fn || '')) return Promise.resolve(resp(200, []));
    return Promise.resolve(resp(200, { ok: true }));
  };
  const P = abrirPanel({ ahora: AHORA, red });
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera({ socios: [FICHA()], prestamos: [], config: { negocio: 'Tu Garantía' } });
  P.ev('_solicitudes = ' + JSON.stringify(o.solicitudes || [PIDE()]) + ';');
  const preguntas = [];
  P.ctx.alert = m => { preguntas.push('ALERT ' + String(m)); };
  P.ctx.confirm = m => { preguntas.push(String(m)); return !/WhatsApp|bienvenida/.test(String(m)); };
  return { P, vistas, preguntas };
}
const poner = (P, id, v) => P.ev("document.getElementById('" + id + "').value=" + JSON.stringify(String(v)));
/* «✏️ Proponer» → «A cuotas», con monto, cuántas, y las fechas y los %. */
function proponerACuotas(P, cap, entradas, n) {
  P.ev("editarContrapropuesta('77','quincenal')");
  poner(P, 'pqCap', cap);
  poner(P, 'pqN', n || entradas.length);
  P.ev('filasQuincenalACuotas()');
  entradas.forEach((e, i) => {
    poner(P, 'pqF' + (i + 1), e.fecha);
    poner(P, 'pqP' + (i + 1), e.pct);
    poner(P, 'pqK' + (i + 1), e.capital == null ? '' : e.capital);
  });
  P.ev('_pq.tocadas=true; previsualizarQuincenalACuotas()');
}
const vista = P => plano(P.elems.pqCalc.innerHTML);
const apagado = P => !!P.elems.pqBtn.disabled;
/* La propuesta tal como la guarda la base (contrapropuesta_quincenal_a_cuotas):
   el cuerpo que manda el CRM, más lo que pone la base. */
function propuestaGuardada(cuerpo, creada) {
  const ult = cuerpo.cuotas[cuerpo.cuotas.length - 1].fecha;
  return { capital: cuerpo.capital, costo: cuerpo.costo, total: cuerpo.total, producto: 'quincenal',
    cuotas: cuerpo.cuotas, fecha_pago: ult, dias: M.diasEntre(M.aFechaLocal(HOY), M.aFechaLocal(ult)),
    texto: cuerpo.texto, por: 'joan', creada_en: creada || '2026-11-13T15:00:00.123456+00:00' };
}
/* Lo que deja aceptar_condiciones en la propuesta, con lo que mandó la app. */
function aceptadaCon(sol, vio) {
  const s = JSON.parse(JSON.stringify(sol));
  s.estado = 'aceptada'; s.aceptada_en = '2026-11-13T16:00:00Z';
  s.contrapropuesta.condiciones = { version: vio.version, aceptadas_en: '2026-11-13T16:00:00Z', lineas: vio.lineas,
    tope_mora: vio.tope_mora ? { ea: vio.tope_mora.ea, por_dia: vio.tope_mora.por_dia } : null,
    base: { capital: s.contrapropuesta.capital, total: s.contrapropuesta.total,
            fecha_pago: s.contrapropuesta.fecha_pago, creada_en: s.contrapropuesta.creada_en } };
  s.destino_desembolso = { medio: 'nequi', numero: '3001230098', es_mia: true, propuesta: s.contrapropuesta.creada_en };
  return s;
}
/* El cuerpo que el CRM manda, con las entradas de Joan. */
function cuerpoMandado(entradas, cap) {
  const { P, vistas } = crm();
  proponerACuotas(P, cap || 2000000, entradas);
  P.ev("guardarQuincenalACuotas('77')");
  const env = vistas.filter(x => x.fn === 'contrapropuesta_quincenal_a_cuotas');
  assert.equal(env.length, 1, 'no mandó la propuesta');
  return env[0].cuerpo.p_cuerpo;
}
/* Una solicitud con la propuesta a cuotas, aceptada con lo que arma la app. */
function solicitudAceptada(entradas) {
  const cuerpo = cuerpoMandado(entradas || ENTRADAS);
  const sol = Object.assign(PIDE(), { estado: 'contrapropuesta', contrapropuesta: propuestaGuardada(cuerpo) });
  const vio = CS.paraAceptar(CS.condiciones(sol, { hoy: HOY }));
  return { sol: aceptadaCon(sol, vio), cuerpo, vio };
}

/* =========================================================================
 * 1. «PROPONER» TIENE TRES FORMAS
 * ======================================================================= */
describe('1. «Proponer»: «Un solo pago», «A cuotas» y «Con garantía · mensual»', () => {

  test('los tres botones, y el de garantía ya no se llama «A cuotas · con garantía»', () => {
    const { P } = crm();
    P.ev("editarContrapropuesta('77')");
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /onclick="cambiarModoCp\('unico','77'\)">Un solo pago<\/button>/);
    assert.match(h, /onclick="cambiarModoCp\('quincenal','77'\)">A cuotas<\/button>/);
    assert.match(h, /onclick="cambiarModoCp\('cuotas','77'\)">Con garantía · mensual<\/button>/);
    assert.doesNotMatch(h, /A cuotas · con garantía/);
    /* Sin propuesta y con 79 días pedidos, abre en «A cuotas» (ver §1 «ABRIR EN
       A CUOTAS»); se pasa a un solo pago y se vuelve. */
    assert.equal(P.ev('_cpModo'), 'quincenal');
    P.ev("cambiarModoCp('unico','77')");
    assert.equal(P.ev('_cpModo'), 'unico');
    P.ev("cambiarModoCp('quincenal','77')");
    assert.equal(P.ev('_cpModo'), 'quincenal');
    const f = P.elems.mBody.innerHTML;
    ['id="pqCap"', 'id="pqN"', 'id="pqFilas"', 'id="pqTexto"', 'id="pqCalc"', 'id="pqBtn"'].forEach(x =>
      assert.ok(f.indexOf(x) >= 0, 'falta ' + x + ' en el formulario de «A cuotas»'));
    assert.match(plano(f), /Lo que el cliente lee/);
    assert.match(plano(f), /Mandarle esta propuesta/);
    /* Las filas: fecha, % y capital por cuota (las del registro a cuotas). */
    assert.match(P.elems.pqFilas.innerHTML, /id="pqF2" type="date"/);
    assert.match(P.elems.pqFilas.innerHTML, /id="pqP2" type="number"[^>]*max="50"/);
    assert.match(P.elems.pqFilas.innerHTML, /id="pqK2" type="number"[^>]*placeholder="partes iguales"/);
  });

  /* 13-nov-2026 (revisión) — ABRIR EN «A CUOTAS». «Proponer» abría en «Un solo
     pago» a quien pidió 79 días (un solo pago llega hasta 60), y al pasar de
     una propuesta a cuotas a «Un solo pago» los días arrancaban en 79 y la
     vista previa en error. */
  test('ABRIR EN «A CUOTAS»: pidió más de 60 días y no hay propuesta; y «Un solo pago» arranca en 60 como mucho', () => {
    /* 79 días, sin propuesta: «A cuotas», con la última cuota en lo que pidió. */
    const { P } = crm();
    P.ev("editarContrapropuesta('77')");
    assert.equal(P.ev('_cpModo'), 'quincenal');
    assert.ok(P.elems.mBody.innerHTML.indexOf('id="pqCap"') >= 0, 'no pintó el formulario de «A cuotas»');
    assert.match(P.elems.mBody.innerHTML, /id="pqCap"[^>]*value="2000000"/);
    assert.equal(P.elems['pqF' + P.ev('cuantasCuotasPropuesta()')].value, '2027-01-31', 'la última cuota no es la fecha que pidió');
    assert.match(P.elems.mBody.innerHTML, /btn btn-negro btn-sm" id="cpModoQuincenal"/, 'el botón «A cuotas» no se ve escogido');

    /* 60 días justos, o menos: un solo pago, como siempre. */
    [['2027-01-12', 60], ['2026-12-28', 45]].forEach(([f, d]) => {
      const s = Object.assign(PIDE(), { fecha_corte: f, pedido: { origen: 'play', capital: 2000000, fecha_pago: f, dias: d } });
      const Q = crm({ solicitudes: [s] }).P;
      Q.ev("editarContrapropuesta('77')");
      assert.equal(Q.ev('_cpModo'), 'unico', 'pidió ' + d + ' días');
      assert.match(Q.elems.mBody.innerHTML, new RegExp('id="cpDias"[^>]*value="' + d + '"'));
    });

    /* Con una propuesta de un solo pago ya mandada, abre en la suya aunque haya
       pedido 79: lo que Joan ya le mandó manda. */
    const unico = Object.assign(PIDE(), { estado: 'contrapropuesta',
      contrapropuesta: { capital: 2000000, costo_pct: 20, dias: 60, costo: 400000, total: 2400000, fecha_pago: '2027-01-12', texto: '' } });
    const U = crm({ solicitudes: [unico] }).P;
    U.ev("editarContrapropuesta('77')");
    assert.equal(U.ev('_cpModo'), 'unico');

    /* El préstamo con garantía que pidió a meses, como estaba. */
    const resp = Object.assign(PIDE(), { producto: 'respaldado', plazo_meses: 6 });
    const R = crm({ solicitudes: [resp] }).P;
    R.ev("editarContrapropuesta('77')");
    assert.equal(R.ev('_cpModo'), 'unico');

    /* De una propuesta «A cuotas» (la base guardó dias = 79, la última cuota) a
       «Un solo pago»: los días arrancan en 60 y la vista previa no da error.
       El capital y el % son los de siempre en ese modo. */
    const cuerpo = cuerpoMandado(ENTRADAS);
    const sol = Object.assign(PIDE(), { estado: 'contrapropuesta', contrapropuesta: propuestaGuardada(cuerpo) });
    assert.equal(sol.contrapropuesta.dias, 79);
    const C2 = crm({ solicitudes: [sol] }).P;
    C2.ev("editarContrapropuesta('77')");
    assert.equal(C2.ev('_cpModo'), 'quincenal');
    C2.ev("cambiarModoCp('unico','77')");
    assert.equal(C2.ev('_cpModo'), 'unico');
    const campo = id => (new RegExp('id="' + id + '"[^>]*value="([^"]*)"').exec(C2.elems.mBody.innerHTML) || [])[1];
    assert.equal(campo('cpDias'), '60');
    assert.equal(campo('cpCap'), '2000000');
    assert.equal(campo('cpPct'), '20');
    /* El banco no lee el value del HTML: se ponen los del formulario, como los ve el navegador. */
    ['cpCap', 'cpPct', 'cpDias'].forEach(id => poner(C2, id, campo(id)));
    C2.ev('previsualizarContrapropuesta()');
    assert.match(plano(C2.elems.cpCalc.innerHTML), /El cliente ve recibe \$2\.000\.000 · devuelve \$2\.400\.000 el/);
    assert.doesNotMatch(plano(C2.elems.cpCalc.innerHTML), /más de 60 días/);
  });

  test('las fechas de partida son las del registro, y la última toma la fecha que pidió (79 días, el 31-ene)', () => {
    const { P } = crm();
    P.ev("editarContrapropuesta('77','quincenal')");
    poner(P, 'pqCap', 2000000); poner(P, 'pqN', 3);
    P.ev('filasQuincenalACuotas()');
    const desde = M.cortesSiguientes(HOY, 2);
    assert.deepEqual([1, 2, 3].map(i => P.elems['pqF' + i].value), [desde[0], desde[1], '2027-01-31']);
    assert.deepEqual([1, 2, 3].map(i => P.elems['pqP' + i].value), ['20', '20', '20'], 'el % de partida es el estándar');
    /* La del registro a cuotas, con las mismas entradas: fechasPropuestasAlta. */
    assert.deepEqual(JSON.parse(P.ev("JSON.stringify(fechasPropuestasAlta('" + HOY + "',[],3))")).slice(0, 2), desde);
    /* Y el domingo 31-ene se avisa con la cifra, sin correr la fecha. */
    assert.match(vista(P), /Cuota 3 · El 31-ene es domingo: si paga el primer día hábil \(1-feb\) le corren 1 día de mora, \$\d+/);
    assert.match(vista(P), /La fecha se queda como la pusiste/);
  });

  test('si lo que pidió no cabe (más de 186 días), la última es la del registro', () => {
    const lejos = Object.assign(PIDE(), { fecha_corte: '2027-08-01',
      pedido: { origen: 'play', capital: 2000000, fecha_pago: '2027-08-01', dias: 261 } });
    const { P } = crm({ solicitudes: [lejos] });
    P.ev("editarContrapropuesta('77','quincenal')");
    poner(P, 'pqCap', 2000000); poner(P, 'pqN', 2);
    P.ev('filasQuincenalACuotas()');
    assert.deepEqual([P.elems.pqF1.value, P.elems.pqF2.value], M.cortesSiguientes(HOY, 2));
  });

  test('PARIDAD: la propuesta y el registro a cuotas dan lo mismo con las mismas entradas', () => {
    const casos = [
      { cap: 2000000, e: ENTRADAS },
      { cap: 650000, e: [{ fecha: '2026-11-30', pct: 20, capital: 400000 }, { fecha: '2026-12-15', pct: 25 }] },
      { cap: 20500, e: [{ fecha: '2026-11-30', pct: 35 }, { fecha: '2027-05-18', pct: 35 }] }   // el redondeo del motor, y 186 días
    ];
    casos.forEach(({ cap, e }) => {
      const { P } = crm();
      /* La propuesta (desembolso hoy). */
      proponerACuotas(P, cap, e);
      const prop = JSON.parse(P.ev('JSON.stringify(planDeQuincenalACuotas())'));
      assert.equal(prop.ok, true, JSON.stringify(prop));
      /* El registro a cuotas, con las mismas entradas y desembolso hoy. */
      P.ev('nuevoCredito()');
      poner(P, 'qNombre', 'Otro Prueba'); poner(P, 'qTel', '3001230097');
      poner(P, 'qCap', cap); poner(P, 'qFecha', HOY);
      P.ev("modoAlta('cuotas')");
      poner(P, 'qaN', e.length); P.ev('filasAlta()');
      e.forEach((x, i) => { poner(P, 'qaF' + (i + 1), x.fecha); poner(P, 'qaP' + (i + 1), x.pct);
        poner(P, 'qaK' + (i + 1), x.capital == null ? '' : x.capital); });
      const reg = JSON.parse(P.ev('JSON.stringify(planDelAlta(' + cap + ",'" + HOY + "'))"));
      assert.equal(reg.ok, true, JSON.stringify(reg));
      assert.deepEqual(prop.plan, reg.plan, 'la propuesta y el registro calculan distinto con ' + JSON.stringify(e));
      /* Y es el del motor, sin nada de la pantalla en el medio. */
      assert.deepEqual(prop.plan, JSON.parse(JSON.stringify(M.construirPlanACuotas(cap,
        e.map(x => ({ fecha: x.fecha, pct: x.pct, capital: x.capital == null ? null : x.capital })), { fechaDesembolso: HOY }))));
    });
  });

  test('la vista previa en pesos: lo que recibe, cada cuota con capital, costo y total, el total, la garantía', () => {
    const { P } = crm();
    proponerACuotas(P, 2000000, ENTRADAS);
    const plan = M.construirPlanACuotas(2000000, ENTRADAS, { fechaDesembolso: HOY });
    const v = vista(P);
    assert.match(v, /El cliente ve recibe \$2\.000\.000 · 3 cuotas, la primera el/);
    plan.cuotas.forEach(q => assert.ok(v.indexOf(q.pct + '% capital $' + q.capital.toLocaleString('es-CO') + ' + costo $' + q.costo.toLocaleString('es-CO') +
      ' $' + q.total.toLocaleString('es-CO')) >= 0, 'falta la cuota ' + q.numero + ' en la vista: ' + v));
    assert.match(v, new RegExp('Devuelve en total \\$' + plan.total_a_pagar.toLocaleString('es-CO').replace(/\./g, '\\.')));
    assert.match(v, new RegExp('Garantía que le deja \\(si paga en fecha\\) \\$' + plan.total_garantia.toLocaleString('es-CO').replace(/\./g, '\\.')));
    assert.match(v, /E\.A\. real, con estas fechas/);
    assert.equal(apagado(P), false);
  });

  /* 13-nov-2026 (revisión) — EL CELULAR A 390 PX. La vista previa era una tabla
     de seis columnas, y en pantallas de menos de 880 toda tabla del CRM mide al
     menos 560 px (la regla de abajo): en la caja de 306 px del modal, Capital,
     Costo y Total quedaban cortados. Medido en Chrome sin ventana a 390×844:
     antes la tabla iba de 56 a 616 px en una caja de 306; ahora nada se sale.
     Aquí, lo que se puede vigilar sin navegador: que no vuelva la tabla, que cada
     cuota lleve su plata en su renglón, y que las filas de los campos puedan
     encoger (la columna «Capital» se salía 170 px). */
  test('a 390 px se lee entera: cada cuota en su renglón, sin tabla, y las filas encogen', () => {
    const CRM = require('node:fs').readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    assert.match(CRM, /@media\(max-width:880px\)\{[\s\S]*?table\{min-width:560px\}/, 'la regla que cortaba la tabla ya no está: revisa este comentario');
    const enRenglones = (html, plan, donde) => {
      assert.doesNotMatch(html, /<table/, 'volvió la tabla a ' + donde + ': a 390 px mide 560 dentro de 306');
      const t = plano(html);
      plan.cuotas.forEach(q => assert.ok(t.indexOf('Cuota ' + q.numero + ' · ') >= 0 &&
        t.indexOf(q.pct + '% capital ' + CS.pesos(q.capital) + ' + costo ' + CS.pesos(q.costo) + ' ' + CS.pesos(q.total)) >= 0,
        'la cuota ' + q.numero + ' no está entera en ' + donde + ': ' + t));
    };
    const { P } = crm();
    proponerACuotas(P, 2000000, ENTRADAS);
    const plan = M.construirPlanACuotas(2000000, ENTRADAS, { fechaDesembolso: HOY });
    enRenglones(P.elems.pqCalc.innerHTML, plan, 'la propuesta');
    assert.match(plano(P.elems.pqCalc.innerHTML), /Cuota 3 · 31-ene-2027 ⚠️ · 10%/, 'el domingo se marca al lado de la fecha');
    /* El registro a cuotas traía la misma tabla, y pinta con la misma función. */
    P.ev('nuevoCredito()');
    poner(P, 'qNombre', 'Otro Prueba'); poner(P, 'qTel', '3001230097');
    poner(P, 'qCap', 2000000); poner(P, 'qFecha', HOY);
    P.ev("modoAlta('cuotas')");
    poner(P, 'qaN', 3); P.ev('filasAlta()');
    ENTRADAS.forEach((x, i) => { poner(P, 'qaF' + (i + 1), x.fecha); poner(P, 'qaP' + (i + 1), x.pct); poner(P, 'qaK' + (i + 1), ''); });
    P.ev('_alta.tocadas=true; calcAltaCuotas()');
    enRenglones(P.elems.qaCalc.innerHTML, plan, 'el registro a cuotas');
    /* Las filas de los campos: con «1fr» a secas una columna no baja de lo que
       pide su campo; con el piso en 0, las tres caben. */
    const piso = /grid-template-columns:minmax\(0,1\.3fr\) minmax\(0,\.6fr\) minmax\(0,1fr\)/;
    assert.match(P.elems.qaFilas.innerHTML, piso);
    const Q = crm().P;
    proponerACuotas(Q, 2000000, ENTRADAS);
    assert.match(Q.elems.pqFilas.innerHTML, piso);
  });

  test('LOS LÍMITES apagan el botón y dicen por qué: 1 y 7 cuotas, 187 días, el 51 %, la primera ayer u hoy, el monto', () => {
    const malos = [
      [2000000, [{ fecha: '2026-11-30', pct: 20 }], 1, /Las cuotas van de 2 a 6, y pusiste 1/],
      [2000000, [1, 2, 3, 4, 5, 6, 7].map(i => ({ fecha: M.iso(M.sumarDias(M.aFechaLocal(HOY), i * 15)), pct: 20 })), 7, /Las cuotas van de 2 a 6, y pusiste 7/],
      [2000000, [{ fecha: '2026-11-30', pct: 20 }, { fecha: '2027-05-19', pct: 20 }], 2, /la última cae a 187 días del desembolso; el tope es 186/],
      [2000000, [{ fecha: '2026-11-30', pct: 51 }, { fecha: '2026-12-15', pct: 20 }], 2, /Cuota 1: el 50% es el techo, llegó 51/],
      [2000000, [{ fecha: '2026-11-12', pct: 20 }, { fecha: '2026-12-15', pct: 20 }], 2, /Cuota 1: el 2026-11-12 no es después del desembolso \(2026-11-13\)/],
      [2000000, [{ fecha: HOY, pct: 20 }, { fecha: '2026-12-15', pct: 20 }], 2, /no es después del desembolso/],
      [9000, ENTRADAS, 3, /El monto va de \$10\.000 a \$20\.000\.000/]
    ];
    malos.forEach(([cap, e, n, frase]) => {
      const { P, vistas, preguntas } = crm();
      proponerACuotas(P, cap, e, n);
      assert.match(vista(P), frase);
      assert.equal(apagado(P), true, 'el botón sigue prendido con ' + JSON.stringify(e));
      /* Y si igual se toca (el botón apagado de un navegador viejo), no sale nada. */
      P.ev("guardarQuincenalACuotas('77')");
      assert.equal(vistas.filter(x => x.fn === 'contrapropuesta_quincenal_a_cuotas').length, 0);
      assert.ok(preguntas.some(p => /^ALERT No mandé nada/.test(p)));
    });
    /* Control: 186 días sí, y 6 cuotas sí. */
    const { P } = crm();
    proponerACuotas(P, 2000000, [{ fecha: '2026-11-30', pct: 20 }, { fecha: '2027-05-18', pct: 20 }]);
    assert.equal(apagado(P), false, vista(P));
    proponerACuotas(P, 2000000, [1, 2, 3, 4, 5, 6].map(i => ({ fecha: M.iso(M.sumarDias(M.aFechaLocal(HOY), i * 15)), pct: 20 })));
    assert.equal(apagado(P), false, vista(P));
  });

  test('lo que se manda a la nube es lo que se previsualizó, con su % por cuota y la clave', () => {
    const { P, vistas, preguntas } = crm();
    proponerACuotas(P, 2000000, ENTRADAS);
    poner(P, 'pqTexto', 'Te propongo esto en tres');
    P.ev("guardarQuincenalACuotas('77')");
    const env = vistas.filter(x => x.fn === 'contrapropuesta_quincenal_a_cuotas');
    assert.equal(env.length, 1);
    const plan = M.construirPlanACuotas(2000000, ENTRADAS, { fechaDesembolso: HOY });
    assert.deepEqual(env[0].cuerpo, { p_clave: CLAVE, p_id: 77, p_cuerpo: {
      capital: 2000000, costo: plan.total_costo, total: plan.total_a_pagar,
      cuotas: plan.cuotas.map(q => ({ numero: q.numero, fecha: q.fecha_corte, pct: q.pct, capital: q.capital, costo: q.costo, total: q.total })),
      texto: 'Te propongo esto en tres' } });
    /* La pregunta de antes, con cada cuota en pesos y fecha. */
    const conf = preguntas.find(p => /¿La mando\?/.test(p));
    assert.ok(conf);
    plan.cuotas.forEach(q => assert.ok(conf.indexOf('Cuota ' + q.numero + ': $' + q.total.toLocaleString('es-CO')) >= 0));
    assert.match(conf, /El 31-ene es domingo: si paga el primer día hábil \(1-feb\)/);
  });

  /* 13-nov-2026 (revisión) — LA REJA DEL ESTÁNDAR. El registro a cuotas pide un
     sí aparte cuando una cuota pasa del 20 %; la propuesta mandaba sin
     preguntarlo. Ahora pregunta lo mismo, con la misma función: el texto es el
     del registro, palabra por palabra, salvo la pregunta del final. */
  test('una cuota por encima del estándar pide el MISMO sí aparte del registro a cuotas, antes de «¿La mando?»', () => {
    const ALTAS = [{ fecha: '2026-11-30', pct: 25 }, { fecha: '2026-12-15', pct: 15 }, { fecha: '2027-01-31', pct: 30 }];
    const { P, vistas, preguntas } = crm();
    proponerACuotas(P, 2000000, ALTAS);
    assert.match(vista(P), /Hay cuotas por encima del estándar del 20%: al mandarla te lo confirmo aparte/);
    P.ev("guardarQuincenalACuotas('77')");
    const aparte = preguntas.find(p => /^COSTO POR ENCIMA DEL ESTÁNDAR/.test(p));
    assert.ok(aparte, 'no pidió el sí aparte: ' + preguntas.join('\n---\n'));
    assert.match(aparte, /^COSTO POR ENCIMA DEL ESTÁNDAR en las cuotas 1 \(25%\), 3 \(30%\) \(el estándar es 20%\)/);
    assert.match(aparte, /efectivo anual/);
    assert.match(aparte, /art\. 305 del Código Penal/);
    const plan = M.construirPlanACuotas(2000000, ALTAS, { fechaDesembolso: HOY });
    assert.ok(aparte.indexOf('Al cliente se le muestra en pesos: ' + CS.pesos(plan.total_costo) + ' de costo por $2.000.000.') >= 0, aparte);
    assert.match(aparte, /¿La mando con este costo\?$/);
    assert.ok(preguntas.indexOf(aparte) < preguntas.findIndex(p => /¿La mando\?$/.test(p)), 'la aparte va ANTES de la final');
    assert.equal(vistas.filter(x => x.fn === 'contrapropuesta_quincenal_a_cuotas').length, 1);

    /* El registro a cuotas, con las mismas entradas y el mismo día: su sí aparte
       es el mismo texto, hasta la pregunta del final. */
    P.ev('nuevoCredito()');
    poner(P, 'qNombre', 'Otro Prueba'); poner(P, 'qTel', '3001230097');
    poner(P, 'qCap', 2000000); poner(P, 'qFecha', HOY);
    P.ev("modoAlta('cuotas')");
    poner(P, 'qaN', ALTAS.length); P.ev('filasAlta()');
    ALTAS.forEach((x, i) => { poner(P, 'qaF' + (i + 1), x.fecha); poner(P, 'qaP' + (i + 1), x.pct); poner(P, 'qaK' + (i + 1), ''); });
    P.ev('_alta.tocadas=true; guardarRapido()');
    const delRegistro = preguntas.filter(p => /^COSTO POR ENCIMA DEL ESTÁNDAR/.test(p))[1];
    assert.ok(delRegistro, 'el registro a cuotas no preguntó');
    assert.equal(aparte.replace(/¿La mando con este costo\?$/, '¿Lo registro con este costo?'), delRegistro);

    /* Si dice que no a la aparte, no sale nada ni se ve la pregunta final. */
    const N = crm();
    N.P.ctx.confirm = m => { N.preguntas.push(String(m)); return !/art\. 305/.test(String(m)); };
    proponerACuotas(N.P, 2000000, ALTAS);
    N.P.ev("guardarQuincenalACuotas('77')");
    assert.ok(N.preguntas.some(p => /art\. 305/.test(p)), 'la aparte no se mostró');
    assert.ok(!N.preguntas.some(p => /¿La mando\?$/.test(p)), 'después del NO a la aparte siguió a la final');
    assert.equal(N.vistas.filter(x => x.fn === 'contrapropuesta_quincenal_a_cuotas').length, 0, 'mandó la propuesta después del NO');

    /* Al estándar o por debajo, no hay aparte. */
    const E = crm();
    proponerACuotas(E.P, 2000000, ENTRADAS);
    E.P.ev("guardarQuincenalACuotas('77')");
    assert.ok(!E.preguntas.some(p => /COSTO POR ENCIMA DEL ESTÁNDAR/.test(p)));
    assert.doesNotMatch(vista(E.P), /por encima del estándar/);
    assert.equal(E.vistas.filter(x => x.fn === 'contrapropuesta_quincenal_a_cuotas').length, 1);
  });

  test('sin la migración (404), dice cuál archivo falta y no manda nada', async () => {
    const { P, preguntas } = crm({ sinFuncion: 'contrapropuesta_quincenal_a_cuotas' });
    proponerACuotas(P, 2000000, ENTRADAS);
    P.ev("guardarQuincenalACuotas('77')");
    await asentar();
    assert.ok(preguntas.some(p => /^ALERT .*base\/20261113b_propuesta_quincenal_a_cuotas\.sql/.test(p)), preguntas.join('\n'));
  });

  test('al reabrirla: «A cuotas», con sus fechas, sus % y sus capitales; la de garantía, en «Con garantía»', () => {
    const cuerpo = cuerpoMandado([{ fecha: '2026-11-30', pct: 20, capital: 1200000 }, { fecha: '2026-12-15', pct: 25 }]);
    const sol = Object.assign(PIDE(), { estado: 'contrapropuesta', contrapropuesta: propuestaGuardada(cuerpo) });
    const { P } = crm({ solicitudes: [sol] });
    P.ev("editarContrapropuesta('77')");
    assert.equal(P.ev('_cpModo'), 'quincenal');
    assert.deepEqual([P.elems.pqF1.value, P.elems.pqF2.value, P.elems.pqP1.value, P.elems.pqP2.value, P.elems.pqK1.value],
      ['2026-11-30', '2026-12-15', '20', '25', '1200000']);
    const resp = Object.assign(PIDE(), { estado: 'contrapropuesta', producto: 'respaldado',
      contrapropuesta: { capital: 2000000, costo: 142308, total: 2142308, meses: 6, producto: 'respaldado',
        cuotas: [{ numero: 1, fecha: '2026-12-15', capital: 317000, costo: 40000, total: 357000 },
                 { numero: 2, fecha: '2027-01-15', capital: 317000, costo: 40000, total: 357000 }] } });
    const R = crm({ solicitudes: [resp] }).P;
    R.ev("editarContrapropuesta('77')");
    assert.equal(R.ev('_cpModo'), 'cuotas');
  });
});

/* =========================================================================
 * 2. LOS OTROS DOS MODOS NO CAMBIARON
 * ======================================================================= */
describe('2. «Un solo pago» y «Con garantía · mensual» mandan lo mismo que antes', () => {

  test('un solo pago: contrapropuesta_solicitud con el capital, el % y los días escritos', () => {
    const { P, vistas } = crm();
    P.ev("editarContrapropuesta('77','unico')");
    poner(P, 'cpCap', 800000); poner(P, 'cpPct', 20); poner(P, 'cpDias', 30); poner(P, 'cpTexto', 'Hola');
    P.ev("guardarContrapropuesta('77')");
    const env = vistas.filter(x => x.fn === 'contrapropuesta_solicitud');
    assert.equal(env.length, 1);
    assert.deepEqual(env[0].cuerpo, { p_clave: CLAVE, p_id: 77, p_capital: 800000, p_costo_pct: 20, p_dias: 30, p_texto: 'Hola' });
    assert.equal(vistas.filter(x => /quincenal_a_cuotas/.test(x.fn || '')).length, 0);
  });

  test('con garantía: contrapropuesta_a_cuotas con el plan del motor, como el 16-sep', () => {
    const { P, vistas } = crm();
    P.ev('entradaRespaldoDe = function () { return { datos: {}, referidos: 0, acumulada: 3000000, ajuste: 0, comprometida: 0 }; };');
    P.ev("editarContrapropuesta('77','cuotas')");
    poner(P, 'cqCap', 2000000); poner(P, 'cqMeses', 6);
    const p = JSON.parse(P.ev('JSON.stringify(planDeCuotas())'));
    const r = M.simularPrestamoRespaldado(2000000, 6, { datos: {}, referidos: 0, acumulada: 3000000, ajuste: 0, comprometida: 0 },
      { fechaDesembolso: HOY });
    assert.equal(p.total, r.total_a_pagar);
    assert.deepEqual(p.cuotas.map(q => [q.fecha, q.total]), r.cuotas.map(q => [q.fecha_corte, q.total]));
    P.ev("guardarContrapropuestaCuotas('77')");
    const env = vistas.filter(x => x.fn === 'contrapropuesta_a_cuotas');
    assert.equal(env.length, p.ea > p.tope ? 0 : 1);
    if (env.length) assert.equal(env[0].cuerpo.p_cuerpo.meses, 6);
    assert.equal(vistas.filter(x => /quincenal_a_cuotas/.test(x.fn || '')).length, 0);
  });
});

/* =========================================================================
 * 3. LA APP DEL CLIENTE LA LEE EN PESOS
 * ======================================================================= */
describe('3. La app del cliente: las condiciones de una quincenal a cuotas', () => {
  const cuerpo = () => cuerpoMandado(ENTRADAS);
  const sol = () => Object.assign(PIDE(), { estado: 'contrapropuesta', contrapropuesta: propuestaGuardada(cuerpo()) });

  test('cada cuota con su fecha y su total, lo que cuesta, y ningún porcentaje', () => {
    const c = CS.condiciones(sol(), { hoy: HOY });
    const plan = M.construirPlanACuotas(2000000, ENTRADAS, { fechaDesembolso: HOY });
    assert.equal(c.cuotas, 3);
    assert.equal(c.fecha_pago, '2027-01-31');
    const v = k => (c.lineas.find(l => l.clave === k) || {}).v;
    assert.equal(v('recibes'), '$2.000.000');
    assert.equal(v('pagas'), '3 cuotas, en estas fechas:');
    plan.cuotas.forEach(q => assert.equal(v('cuota' + q.numero), CS.pesos(q.total) + ' el ' + CS.fechaLarga(q.fecha_corte)));
    assert.equal(v('cuota3'), CS.pesos(plan.cuotas[2].total) + ' el domingo 31 de enero de 2027');
    assert.equal(v('total'), CS.pesos(plan.total_a_pagar));
    assert.match(v('costo'), new RegExp('^' + CS.pesos(plan.total_costo).replace(/[$.]/g, '\\$&') + ', ya sumado en el total'));
    assert.doesNotMatch(c.texto, /%/, 'el cliente leyó un porcentaje');
  });

  test('la garantía es la del quincenal, cuota por cuota (la del motor), no la del préstamo con garantía', () => {
    const c = CS.condiciones(sol(), { hoy: HOY });
    const plan = M.construirPlanACuotas(2000000, ENTRADAS, { fechaDesembolso: HOY });
    const porCuota = plan.cuotas.reduce((t, q) => t + M.acumularGarantia(q.costo, true), 0);
    assert.equal(porCuota, plan.total_garantia);
    const g = (c.lineas.find(l => l.clave === 'garantia') || {}).v;
    assert.equal(g, 'Si pagas cada cuota en su fecha, te suma ' + CS.pesos(porCuota) + ' de garantía. ' +
      'La garantía no es plata que te devolvamos: es tu historial, y es lo que te deja pedir más.');
    assert.notEqual(porCuota, M.acumularGarantiaRespaldada(plan.total_costo, true), 'el caso no distingue las dos garantías');
  });

  test('si te atrasas: el techo del recargo sobre el capital de la cuota (el más grande), no sobre la cuota entera', () => {
    const c = CS.condiciones(sol(), { hoy: HOY });
    const plan = M.construirPlanACuotas(2000000, ENTRADAS, { fechaDesembolso: HOY });
    const base = Math.max.apply(null, plan.cuotas.map(q => q.capital));
    const t = CS.topeDeMora(base, HOY);
    assert.ok(t, 'sin tabla de usura para el 13-nov la prueba no mira nada');
    assert.deepEqual(c.tope_mora, { ea: t.ea, diaria: t.diaria, por_dia: t.por_dia, base });
    const a = (c.lineas.find(l => l.clave === 'atraso') || {}).v;
    assert.match(a, new RegExp('hasta ' + CS.pesos(t.por_dia).replace(/[$.]/g, '\\$&') + ' por día sobre los ' +
      CS.pesos(base).replace(/[$.]/g, '\\$&') + ' de capital de la cuota más grande'));
    /* Lo que se cobra (puente.js) corre sobre el capital de la cuota, con el techo de la aceptación. */
    const p = { id: 'x', capital: 2000000, costoPct: 20, fechaDesembolso: HOY, cicloActual: plan.cuotas[0].fecha_corte,
      prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false, topeMoraEA: t.ea, planPagos: PU.planPagosDeAlta(plan) };
    const ven = PU.cuotasVencidas(p, '2026-12-01').find(q => q.n === 1);
    assert.ok(ven.mora <= t.por_dia * ven.dias, 'el cobro pasa lo que se publicó: ' + ven.mora + ' > ' + t.por_dia);
    /* Sin prórroga, que no la tiene: mover una fecha o un acuerdo sobre el recargo. */
    assert.doesNotMatch(a, /prórroga/);
    assert.match(a, /mover la fecha de una cuota antes de que venza/);
  });

  test('con capitales iguales se dice «de cada cuota»', () => {
    const c = CS.condiciones({ id: 1, contrapropuesta: propuestaGuardada(cuerpoMandado(
      [{ fecha: '2026-11-30', pct: 20 }, { fecha: '2026-12-15', pct: 20 }], 650000)) }, { hoy: HOY });
    assert.match((c.lineas.find(l => l.clave === 'atraso') || {}).v, /sobre los \$325\.000 de capital de cada cuota/);
  });

  test('la del préstamo con garantía y la de un solo pago se leen como antes', () => {
    const plan = M.construirPlanACuotas(2000000, ENTRADAS, { fechaDesembolso: HOY });
    const cuotas = plan.cuotas.map(q => ({ numero: q.numero, fecha: q.fecha_corte, capital: q.capital, costo: q.costo, total: q.total }));
    const r = CS.condiciones({ id: 1, contrapropuesta: { capital: 2000000, costo: plan.total_costo, total: plan.total_a_pagar,
      producto: 'respaldado', cuotas } }, { hoy: HOY });
    const v = k => (r.lineas.find(l => l.clave === k) || {}).v;
    assert.equal(v('garantia'), 'Si pagas cada cuota en su fecha, te suma ' + CS.pesos(M.acumularGarantiaRespaldada(plan.total_costo, true)) + ' de garantía.');
    assert.equal(r.tope_mora.base, plan.cuotas[0].total, 'el recargo del de garantía es sobre la cuota entera');
    assert.match(v('atraso'), /una prórroga, un plan de pagos/);
    const u = CS.condiciones({ id: 2, contrapropuesta: { capital: 600000, costo: 120000, total: 720000, costo_pct: 20, dias: 15,
      fecha_pago: '2026-11-28' } }, { hoy: HOY });
    assert.match(u.lineas.find(l => l.clave === 'pagas').v, /^Un solo pago de \$720\.000 el sábado 28 de noviembre de 2026/);
    assert.equal(u.tope_mora.base, 600000);
  });
});

/* =========================================================================
 * 4. LA CONSTANCIA Y EL COTEJO DEL CRM
 * ======================================================================= */
describe('4. La constancia lleva las cuotas, y el CRM las coteja sin descuadres falsos', () => {

  test('lo que viaja con la aceptación trae cada cuota; la fecha de pago es la última', () => {
    const { vio } = solicitudAceptada();
    assert.equal(vio.fecha_pago, '2027-01-31');
    assert.equal(vio.lineas.filter(l => /^cuota\d$/.test(l.clave)).length, 3);
  });

  test('aceptada tal cual: sin descuadre; una cuota cambiada o una de menos: con su número', () => {
    const { sol } = solicitudAceptada();
    const { P } = crm({ solicitudes: [sol] });
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(descuadreDeConstancia(_solicitudes[0]))')), []);
    /* Su app dijo otra cifra en la cuota 2. */
    P.ev("_solicitudes[0].contrapropuesta.condiciones.lineas.find(l=>l.clave==='cuota2').v='$1.000 el martes 15 de diciembre de 2026'");
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(descuadreDeConstancia(_solicitudes[0]))')), ['la cuota 2']);
    /* Y otro día con la misma plata. */
    const { sol: s2 } = solicitudAceptada();
    const otra = s2.contrapropuesta.condiciones.lineas.find(l => l.clave === 'cuota3');
    otra.v = otra.v.replace('domingo 31 de enero', 'sábado 30 de enero');
    const Q = crm({ solicitudes: [s2] }).P;
    assert.deepEqual(JSON.parse(Q.ev('JSON.stringify(descuadreDeConstancia(_solicitudes[0]))')), ['la cuota 3']);
    /* Sin los renglones de las cuotas: no vio las fechas. */
    const { sol: s3 } = solicitudAceptada();
    s3.contrapropuesta.condiciones.lineas = s3.contrapropuesta.condiciones.lineas.filter(l => !/^cuota/.test(l.clave));
    const R = crm({ solicitudes: [s3] }).P;
    assert.match(R.ev('descuadreDeConstancia(_solicitudes[0]).join()'), /las cuotas \(su app mostró 0 y la propuesta tiene 3\)/);
  });

  /* 13-nov-2026 (revisión) — LA CONSTANCIA DISTINGUE EL TEXTO VIEJO. Una
     página con la calculadora de antes (?v=139) lee la quincenal a cuotas como
     la del préstamo con garantía (otra garantía, el recargo sobre la cuota
     entera, una prórroga) y la acepta con la versión '2026-10-22'; sus cuotas
     salen bien, así que el cotejo de las cuotas no lo veía. La versión sube a
     '2026-11-13' y el CRM marca la vieja, SOLO en esta forma: aceptar_condiciones
     no compara la versión, y las de un solo pago y con garantía que están
     abiertas con la vieja no cambian de texto ni se marcan. */
  test('la versión sube a 2026-11-13, y una quincenal a cuotas aceptada con la vieja es un descuadre', () => {
    assert.equal(CS.VERSION_CONDICIONES, '2026-11-13');
    const { sol, vio } = solicitudAceptada();
    assert.equal(vio.version, '2026-11-13', 'lo que viaja con la aceptación no dice la versión nueva');
    assert.equal(sol.contrapropuesta.condiciones.version, '2026-11-13');
    const { P } = crm({ solicitudes: [sol] });
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(descuadreDeConstancia(_solicitudes[0]))')), []);
    /* La misma, aceptada desde una página vieja. */
    P.ev("_solicitudes[0].contrapropuesta.condiciones.version='2026-10-22'");
    const malos = JSON.parse(P.ev('JSON.stringify(descuadreDeConstancia(_solicitudes[0]))'));
    assert.deepEqual(malos, ['lo que leyó (su app tenía las condiciones de antes, versión 2026-10-22: otra garantía y una prórroga que este crédito no tiene)']);
    /* Sin versión, también. */
    P.ev('delete _solicitudes[0].contrapropuesta.condiciones.version');
    assert.match(P.ev('descuadreDeConstancia(_solicitudes[0]).join()'), /versión sin versión/);
    /* Y se dice donde Joan lo ve: en la fila y antes de desembolsar. */
    P.ev("_solicitudes[0].contrapropuesta.condiciones.version='2026-10-22'; renderBandeja()");
    assert.match(plano(P.elems.bandeja.innerHTML), /no casa con la base: lo que leyó \(su app tenía las condiciones de antes/);

    /* Las otras dos formas, abiertas y aceptadas con la versión vieja: sin descuadre. */
    const unico = Object.assign(PIDE(), { estado: 'contrapropuesta',
      contrapropuesta: { capital: 600000, costo_pct: 20, dias: 15, costo: 120000, total: 720000, fecha_pago: '2026-11-28',
        texto: '', por: 'joan', creada_en: '2026-11-12T15:00:00.123456+00:00' } });
    const garantia = Object.assign(PIDE(), { estado: 'contrapropuesta', producto: 'respaldado',
      contrapropuesta: { capital: 2000000, costo: 80000, total: 2080000, meses: 2, producto: 'respaldado', fecha_pago: '2027-01-15',
        creada_en: '2026-11-12T15:00:00.123456+00:00',
        cuotas: [{ numero: 1, fecha: '2026-12-15', capital: 1000000, costo: 40000, total: 1040000 },
                 { numero: 2, fecha: '2027-01-15', capital: 1000000, costo: 40000, total: 1040000 }] } });
    [unico, garantia].forEach(s => {
      const v = CS.paraAceptar(CS.condiciones(s, { hoy: HOY }));
      const acept = aceptadaCon(s, Object.assign({}, v, { version: '2026-10-22' }));
      const Q = crm({ solicitudes: [acept] }).P;
      assert.deepEqual(JSON.parse(Q.ev('JSON.stringify(descuadreDeConstancia(_solicitudes[0]))')), [],
        'una ' + (s.producto === 'respaldado' ? 'con garantía' : 'de un solo pago') + ' aceptada con la versión vieja salió como descuadre');
    });
  });

  test('«Lo que aceptó» enseña las cuotas según la base', () => {
    const { sol } = solicitudAceptada();
    const { P } = crm({ solicitudes: [sol] });
    P.ev("verCondicionesAceptadas('77')");
    const t = plano(P.elems.mBody.innerHTML);
    assert.match(t, /Según la base Recibe \$2\.000\.000/);
    sol.contrapropuesta.cuotas.forEach(q => assert.ok(t.indexOf('Cuota ' + q.numero + ' · ') >= 0 && t.indexOf(CS.pesos(q.total).replace('$', '')) >= 0));
    assert.match(t, /Última cuota/);
    assert.doesNotMatch(t, /no casa con la base/);
  });
});

/* =========================================================================
 * 5. EL DESEMBOLSO
 * ======================================================================= */
describe('5. Desembolsarla: el mismo crédito que el registro a cuotas, con lo aceptado', () => {

  test('registra el planPagos del registro a cuotas, con el destino, el techo del recargo y la solicitud atendida', async () => {
    const { sol } = solicitudAceptada();
    const { P, vistas, preguntas } = crm({ solicitudes: [sol] });
    P.ev("crearDesdeSolicitud('77')");
    await asentar();
    const ps = JSON.parse(P.ev('JSON.stringify(DB.prestamos)'));
    assert.equal(ps.length, 1, preguntas.join('\n---\n'));
    const p = ps[0];
    const plan = M.construirPlanACuotas(2000000, ENTRADAS, { fechaDesembolso: HOY });
    assert.deepEqual(p.planPagos, JSON.parse(JSON.stringify(PU.planPagosDeAlta(plan))));
    assert.equal(p.planPagos.origen, 'alta');
    assert.deepEqual(p.planPagos.cuotas.map(c => [c.fecha, c.pct]), ENTRADAS.map(e => [e.fecha, e.pct]), 'no son las fechas y los % aceptados');
    assert.equal(p.capital, 2000000);
    assert.equal(p.costoPct, 20, 'costoPct es el % de la cuota 1');
    assert.equal(p.cicloActual, '2026-11-30', 'cicloActual es la fecha de la cuota 1');
    assert.equal(p.fechaDesembolso, HOY);
    assert.equal(p.origen, 'solicitud');
    assert.equal(p.socioId, 'C700');
    assert.equal(p.topeMoraEA, C.topeDeReferencia('2026-11-13').tope);
    assert.equal(p.condicionesDe, '77');
    assert.equal(p.consignarA.numero, '3001230098');
    const marca = vistas.find(x => x.fn === 'marcar_solicitud');
    assert.ok(marca, 'la solicitud no se marcó en la nube');
    assert.equal(marca.cuerpo.p_estado, 'atendida');
    assert.equal(P.ev('_solicitudes.length'), 0, 'la solicitud sigue en la bandeja');
    /* La pregunta de antes, con cada cuota, el destino y el recargo. */
    const conf = preguntas.find(t => /¿Lo registro\?/.test(t));
    assert.match(conf, /Crear el crédito A CUOTAS de Ana Prueba/);
    assert.match(conf, /Cuota 3: \$[\d.]+ el 31-ene-2027/);
    assert.match(conf, /Consignar a:/);
    assert.match(conf, /techo legal que aceptó/);
    assert.match(conf, /31-ene es domingo/);
  });

  test('PARIDAD: es el mismo crédito que el registro a cuotas con las mismas entradas', () => {
    const { sol } = solicitudAceptada();
    const { P } = crm({ solicitudes: [sol] });
    P.ev("crearDesdeSolicitud('77')");
    P.ev('nuevoCredito()');
    poner(P, 'qNombre', 'Otro Prueba'); poner(P, 'qTel', '3001230097');
    poner(P, 'qCap', 2000000); poner(P, 'qFecha', HOY);
    P.ev("modoAlta('cuotas')");
    poner(P, 'qaN', 3); P.ev('filasAlta()');
    ENTRADAS.forEach((x, i) => { poner(P, 'qaF' + (i + 1), x.fecha); poner(P, 'qaP' + (i + 1), x.pct); poner(P, 'qaK' + (i + 1), ''); });
    P.ev('_alta.tocadas=true; guardarRapido()');
    const ps = JSON.parse(P.ev('JSON.stringify(DB.prestamos)'));
    assert.equal(ps.length, 2);
    assert.deepEqual(ps[0].planPagos, ps[1].planPagos);
    ['capital', 'costoPct', 'fechaDesembolso', 'cicloActual'].forEach(k => assert.equal(ps[0][k], ps[1][k], k));
  });

  test('si el motor de hoy no da peso por peso lo aceptado, NO registra y manda a «✏️ Cambiar propuesta»', () => {
    const { sol } = solicitudAceptada();
    /* La base guardó un costo que el motor no da (una propuesta de otra regla). */
    sol.contrapropuesta.cuotas[1].costo += 1000; sol.contrapropuesta.cuotas[1].total += 1000;
    const { P, preguntas } = crm({ solicitudes: [sol] });
    P.ev("crearDesdeSolicitud('77')");
    assert.equal(P.ev('DB.prestamos.length'), 0, 'registró lo que el motor no da');
    const a = preguntas.filter(t => /^ALERT/.test(t)).pop() || '';
    assert.match(a, /No registré nada: lo que aceptó no es lo que da el motor hoy en la cuota 2/);
    assert.match(a, /✏️ Cambiar propuesta/);
    assert.equal(P.ev('_solicitudes.length'), 1, 'la sacó de la bandeja sin registrar');
  });

  test('con la primera cuota ya llegada, no registra: el crédito nacería vencido', () => {
    const { sol } = solicitudAceptada([{ fecha: '2026-11-30', pct: 20 }, { fecha: '2026-12-15', pct: 20 }]);
    sol.contrapropuesta.cuotas[0].fecha = '2026-11-13';
    const { P, preguntas } = crm({ solicitudes: [sol] });
    P.ev("crearDesdeSolicitud('77')");
    assert.equal(P.ev('DB.prestamos.length'), 0);
    assert.ok(preguntas.some(t => /^ALERT ⚠️ Lo que aceptó Ana Prueba tenía la primera cuota/.test(t)), preguntas.join('\n'));
  });
});

/* =========================================================================
 * 6. LA FICHA Y 📨 SOLICITUDES, EN UNA LÍNEA
 * ======================================================================= */
describe('6. «Lo que pidió» y 📨 Solicitudes: «N cuotas, la primera el …, total …»', () => {

  test('la línea de la propuesta, y la fila de la bandeja', () => {
    const cuerpo = cuerpoMandado(ENTRADAS);
    const sol = Object.assign(PIDE(), { estado: 'contrapropuesta', contrapropuesta: propuestaGuardada(cuerpo) });
    const { P } = crm({ solicitudes: [sol] });
    const total = CS.pesos(cuerpo.total);
    const linea = P.ev('propuestaEnUnaLinea(_solicitudes[0])');
    assert.equal(linea, 'le propusiste $2.000.000 en 3 cuotas, la primera el ' + P.ev("fmtFecha('2026-11-30')") + ', total ' + total);
    P.ev('renderBandeja()');
    const h = P.elems.bandeja.innerHTML;
    const fila = h.slice(h.lastIndexOf('<tr>', h.indexOf("descartarSolicitud('77')")), h.indexOf('</tr>', h.indexOf("descartarSolicitud('77')")));
    const t = plano(fila);
    assert.match(t, new RegExp('A cuotas 3 cuotas, la primera el [^,]+, total ' + total.replace(/[$.]/g, '\\$&')));
    assert.match(t, /la primera de 3/);
    assert.doesNotMatch(t, /él aceptó/, 'un descuadre falso en la fila');
    assert.doesNotMatch(t, /Primer crédito/);
  });
});
