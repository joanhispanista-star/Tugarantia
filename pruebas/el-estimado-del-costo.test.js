/* ============================================================================
 * EL ESTIMADO DEL COSTO ANTES DE LA PROPUESTA — 19 de octubre de 2026
 *
 * William pidió 300.000 desde la app y no vio cuánto le tocaba pagar: la
 * calculadora decía «el costo exacto te lo mandamos en la propuesta» y nada
 * más. Joan, textual: «deja un estimado del 2%» (al mes) y «que no pase el
 * nivel de usura».
 *
 * Lo que amarra esta batería (la del CRM y la de la base están en
 * el-estimado-del-costo-crm.test.js y el-estimado-viaja-postgres.test.js):
 *
 *   1. LA CUENTA (app/calculadora-solicitud.js, estimadoDelCosto): capital ×
 *      2% × días / 30, redondeado al peso. 300.000 a 30 días el 19-oct: 6.000.
 *   2. LA REJA DE USURA: la efectiva anual del estimado, medida con la cuenta
 *      de app/creditos.js contra el techo vigente ESE día; si no queda debajo,
 *      se baja. Con una tabla sin techo para el día, NO hay cifra.
 *   3. LA CALCULADORA EN PANTALLA: «Costo estimado: $6.000 · Total estimado:
 *      $306.000», rotulado como estimado, en pesos y sin un porcentaje.
 *   4. play/ DE VERDAD (banco-play.js): se ve, se mueve con el dedo, y al pedir
 *      el estimado viaja a la base (anotar_estimado) — y no viaja cuando no se
 *      mostró ninguno.
 *   5. index.html carga la tabla de usura para poder estimar.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPlay } = require('./banco-play.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CS = require('../app/calculadora-solicitud.js');
const C = require('../app/creditos.js');

const tick = () => new Promise(r => setImmediate(r));
const ticks = async () => { for (let i = 0; i < 8; i++) await tick(); };

/* Una tabla de usura de mentira: la de verdad con otro techo, o sin techo. Se
   copia el objeto: clavarle un topeVigente al módulo compartido envenenaría
   las pruebas de otros archivos (ya pasó; ver banco-play.js). */
const conTecho = (techo, hasta) => Object.assign({}, C, {
  topeVigente: () => ({ desde: '2026-10-01', hasta: hasta || '2026-10-31', consumo_ordinario: techo, fuente: 'de prueba' })
});
/* La tabla tal como queda el 1-nov si nadie agrega la fila de noviembre:
   octubre es lo último certificado. */
const soloHastaOctubre = Object.assign({}, C, {
  topeVigente: iso => C.TOPES.filter(t => t.hasta <= '2026-10-31').find(t => iso >= t.desde && iso <= t.hasta) || null
});
const visible = h => String(h).replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/* ==========================================================================
 * 1. LA CUENTA
 * ======================================================================== */
describe('el estimado: capital × 2% × días / 30, redondeado', () => {

  test('el caso de William: 300.000 a 30 días el 19-oct son 6.000', () => {
    const e = CS.estimadoDelCosto(300000, '2026-11-18', '2026-10-19');
    assert.ok(e, 'el 19-oct hay techo certificado y aun así no estimó');
    assert.equal(e.costo, 6000);
    assert.equal(e.total, 306000);
    assert.equal(e.tasa_mensual, 0.02);
    assert.equal(e.dias, 30);
    assert.equal(e.techo, 0.2859, 'no midió contra el techo de octubre');
    assert.equal(e.hasta, '2026-10-31');
    assert.ok(e.ea > 0 && e.ea < e.techo, 'la efectiva anual del estimado no quedó debajo del techo: ' + e.ea);
    assert.equal(e.ajustado, false);
  });

  test('la tasa es la de Joan, el 2% al mes, y no otra', () => {
    assert.equal(CS.TASA_ESTIMADO_MENSUAL, 0.02);
  });

  test('prorrateado por días y redondeado al peso, sin decimales binarios', () => {
    assert.equal(CS.estimadoDelCosto(300000, '2026-11-03', '2026-10-19').costo, 3000, '15 días son medio mes');
    assert.equal(CS.estimadoDelCosto(1000000, '2026-10-27', '2026-10-19').costo, 5333, '1.000.000 a 8 días: 5.333,33');
    /* Medio peso exacto: 50.250 a un día son 33,5 → 34 (hacia arriba, como
       Math.round). Con 0,02 en coma flotante este caso cae del lado que no es
       según el capital: por eso la cuenta va en enteros. */
    assert.equal(CS.estimadoDelCosto(50250, '2026-10-20', '2026-10-19').costo, 34);
    /* El total es SIEMPRE capital + costo: un peso de diferencia entre lo que
       dice el estimado y lo que suma es una discusión con un cliente delante. */
    [50000, 137500, 300000, 999999, 20000000].forEach(m => [1, 7, 30, 61, 180].forEach(d => {
      const e = CS.estimadoDelCosto(m, CS.fechaEn(d, '2026-10-19'), '2026-10-19');
      assert.equal(e.total, m + e.costo);
    }));
  });

  test('datos raros no dan cifra: ni capital cero, ni fecha de hoy o de ayer, ni fechas rotas', () => {
    assert.equal(CS.estimadoDelCosto(0, '2026-11-18', '2026-10-19'), null);
    assert.equal(CS.estimadoDelCosto(300000, '2026-10-19', '2026-10-19'), null);
    assert.equal(CS.estimadoDelCosto(300000, '2026-10-18', '2026-10-19'), null);
    assert.equal(CS.estimadoDelCosto(300000, 'mañana', '2026-10-19'), null);
  });
});

/* ==========================================================================
 * 2. LA REJA DE USURA
 * ======================================================================== */
describe('la reja de usura: nunca por encima del techo del día', () => {

  test('barrido de octubre: todo monto, todo plazo de 1 a 180 días, debajo del techo', () => {
    let peor = 0, vistos = 0;
    ['2026-10-01', '2026-10-15', '2026-10-19', '2026-10-31'].forEach(hoy => {
      [50000, 50250, 137500, 300000, 1000000, 20000000].forEach(m => {
        for (let d = 1; d <= 180; d++) {
          const e = CS.estimadoDelCosto(m, CS.fechaEn(d, hoy), hoy);
          assert.ok(e, 'sin estimado el ' + hoy + ' a ' + d + ' días');
          const t = C.topeVigente(hoy).consumo_ordinario;
          /* Medido OTRA VEZ aquí, con la cuenta de creditos.js y no con lo que
             el módulo dice de sí mismo. */
          const ea = C.efectivoAnualPorFechas(hoy, m, [{ fecha: e.fecha_pago, total: e.total }]);
          assert.ok(ea < t, m + ' a ' + d + ' días el ' + hoy + ': ' + (ea * 100).toFixed(3) + '% contra un techo de ' + (t * 100).toFixed(2) + '%');
          peor = Math.max(peor, ea); vistos++;
        }
      });
    });
    assert.ok(vistos > 4000 && peor > 0.25, 'el barrido no midió nada: ' + vistos + ' casos, peor ' + peor);
  });

  test('con un techo bajo (el de enero de 2026, 24,36%), BAJA el costo hasta caber', () => {
    const T = conTecho(0.2436);
    const e = CS.estimadoDelCosto(300000, '2026-11-18', '2026-10-19', { creditos: T });
    assert.ok(e, 'con techo bajo se quedó callado en vez de bajar');
    assert.equal(e.ajustado, true);
    assert.ok(e.costo < 6000 && e.costo > 0, 'no bajó: ' + e.costo);
    assert.ok(e.ea < 0.2436, 'quedó por encima del techo: ' + e.ea);
    /* Es el MÁS ALTO que cabe: un peso más ya no cabe. */
    const unoMas = C.efectivoAnualPorFechas('2026-10-19', 300000, [{ fecha: '2026-11-18', total: 300000 + e.costo + 1 }]);
    assert.ok(unoMas >= 0.2436, 'bajó de más: ' + e.costo + ' y con un peso más todavía cabía');
    assert.ok(e.tasa_mensual < 0.02, 'la tasa que se informa no es la que quedó: ' + e.tasa_mensual);
    assert.equal(e.total, 300000 + e.costo);
  });

  test('en un huso con horario de verano también es el más alto que cabe, y cabe', () => {
    /* creditos.js mide los días con la hora local: en Nueva York, del 19-oct
       al 18-nov hay 30 días y UNA HORA (el cambio de hora del 1-nov). La
       cuenta cerrada con 30 días parejos se quedaba corta por 7 pesos y la
       prueba de «un peso más ya no cabe» fallaba. Se corre en otro proceso:
       el huso se cambia para todo el proceso, y aquí hay otras pruebas. */
    const { execFileSync } = require('node:child_process');
    const codigo = "process.env.TZ = 'America/New_York';" +
      "const CS = require(" + JSON.stringify(path.join(RAIZ, 'app', 'calculadora-solicitud.js')) + ");" +
      "const C = require(" + JSON.stringify(path.join(RAIZ, 'app', 'creditos.js')) + ");" +
      "const T = Object.assign({}, C, { topeVigente: () => ({ consumo_ordinario: 0.2436, hasta: '2026-10-31' }) });" +
      "let malos = []; for (let d = 1; d <= 180; d++) { const f = CS.fechaEn(d, '2026-10-19');" +
      " const e = CS.estimadoDelCosto(300000, f, '2026-10-19', { creditos: T });" +
      " const mas = C.efectivoAnualPorFechas('2026-10-19', 300000, [{ fecha: f, total: 300000 + e.costo + 1 }]);" +
      " if (!(e.ea < 0.2436) || !(mas >= 0.2436)) malos.push(d); }" +
      "process.stdout.write(JSON.stringify({ horas: (new Date('2026-11-18T12:00:00') - new Date('2026-10-19T12:00:00')) / 3600000, malos }));";
    const r = JSON.parse(execFileSync(process.execPath, ['-e', codigo], { encoding: 'utf8' }));
    if (r.horas === 720) return;   // este Node no sabe cambiar de huso en caliente: no hay nada que medir
    assert.deepEqual(r.malos, [], 'en Nueva York el estimado no es el más alto que cabe en estos plazos');
  });

  test('con un techo bajo, en TODOS los plazos queda debajo', () => {
    const T = conTecho(0.20);
    for (let d = 1; d <= 180; d++) {
      const e = CS.estimadoDelCosto(300000, CS.fechaEn(d, '2026-10-19'), '2026-10-19', { creditos: T });
      assert.ok(e && e.ea < 0.20, d + ' días: ' + (e && e.ea));
      assert.equal(e.ajustado, true);
    }
  });

  test('un techo tan bajo que el costo quedaría en cero: no hay cifra (un $0 sería prometer gratis)', () => {
    assert.equal(CS.estimadoDelCosto(50000, '2026-10-20', '2026-10-19', { creditos: conTecho(0.001) }), null);
  });

  test('UNA TABLA SIN TECHO PARA EL DÍA: no se publica cifra', () => {
    /* El 1-nov, si nadie agregó la fila de noviembre. */
    assert.equal(CS.estimadoDelCosto(300000, '2026-12-01', '2026-11-01', { creditos: soloHastaOctubre }), null);
    assert.ok(CS.estimadoDelCosto(300000, '2026-11-30', '2026-10-31', { creditos: soloHastaOctubre }),
      'el 31-oct todavía hay techo');
    /* Y con la tabla de verdad, un día que nunca se certificó. */
    assert.equal(CS.estimadoDelCosto(300000, '2026-07-01', '2026-06-01'), null);
    /* Sin tabla del todo (un <script src> que no llegó). */
    assert.equal(CS.estimadoDelCosto(300000, '2026-11-18', '2026-10-19', { creditos: {} }), null);
  });

  test('sin techo vigente NO usa el «último conocido» (eso es para poner límites, no para publicar)', () => {
    /* topeDeReferencia devuelve el de octubre aunque estemos en noviembre:
       sirve para el recargo por atraso, que se publica HACIA ABAJO. Un
       estimado es una cifra que el cliente lee como lo que va a pagar. */
    const T = Object.assign({}, soloHastaOctubre, { topeDeReferencia: () => ({ tope: 0.2859, vigente: false }) });
    assert.equal(CS.estimadoDelCosto(300000, '2026-12-01', '2026-11-01', { creditos: T }), null);
  });
});

/* ==========================================================================
 * 3. LO QUE VIAJA Y LO QUE LE DICE A JOAN (las funciones; las pantallas, en el
 *    archivo del CRM)
 * ======================================================================== */
describe('lo que viaja con la solicitud y el aviso para Joan', () => {

  test('estimadoParaEnviar: el monto y la fecha del pedido, y las cifras', () => {
    const p = CS.estimadoParaEnviar({ monto: 300000, dias: 30 }, '2026-10-19');
    assert.deepEqual(Object.keys(p).sort(), ['capital', 'costo', 'ea', 'fecha_pago', 'tasa', 'techo', 'total', 'version']);
    assert.equal(p.capital, 300000);
    assert.equal(p.fecha_pago, '2026-11-18', 'la fecha tiene que ser la MISMA que manda pedidoParaEnviar');
    assert.equal(p.fecha_pago, CS.pedidoParaEnviar({ monto: 300000, dias: 30 }, '2026-10-19').p_fecha_pago);
    assert.equal(p.costo, 6000);
    assert.equal(p.total, 306000);
    assert.equal(p.tasa, 0.02);
    assert.equal(p.version, '2026-10-19');
    /* Sin techo para el día, no viaja nada: no se le dice a Joan que el
       cliente vio algo que no vio. */
    assert.equal(CS.estimadoParaEnviar({ monto: 300000, dias: 30 }, '2026-06-01'), null);
  });

  test('el aviso: el caso que Joan escribió, palabra por palabra', () => {
    const a = CS.avisoDelEstimado(60000, { costo: 6000, total: 306000 });
    assert.equal(a.supera, true);
    assert.equal(a.veces, 10);
    assert.equal(a.aviso, 'Tu propuesta ($60.000) es 10 veces lo que la app le estimó: dile por qué, o se va a sentir engañado.');
    assert.match(a.vio, /^El cliente vio un estimado de \$6\.000/);
  });

  test('el aviso dice la proporción con coma, y lo que sobra cuando es menos del doble', () => {
    assert.match(CS.avisoDelEstimado(15000, { costo: 6000, total: 306000 }).aviso, /es 2,5 veces lo que la app le estimó/);
    assert.match(CS.avisoDelEstimado(7000, { costo: 6000, total: 306000 }).aviso,
      /^Tu propuesta \(\$7\.000\) es \$1\.000 más de lo que la app le estimó \(\$6\.000\): dile por qué/);
  });

  test('igual o por debajo del estimado no avisa; sin estimado no dice nada', () => {
    assert.equal(CS.avisoDelEstimado(6000, { costo: 6000, total: 306000 }).supera, false);
    assert.equal(CS.avisoDelEstimado(4000, { costo: 6000, total: 306000 }).supera, false);
    assert.equal(CS.avisoDelEstimado(null, { costo: 6000, total: 306000 }).supera, false);
    assert.equal(CS.avisoDelEstimado(60000, null), null);
    assert.equal(CS.avisoDelEstimado(60000, { costo: 0 }), null);
  });

  test('estimadoDeSolicitud lee pedido.estimado y desconfía de lo que no cuadra', () => {
    assert.deepEqual(CS.estimadoDeSolicitud({ pedido: { origen: 'play', estimado: { costo: 6000, total: 306000, tasa: 0.02, cuando: 'x' } } }),
      { costo: 6000, total: 306000, tasa: 0.02, cuando: 'x' });
    assert.equal(CS.estimadoDeSolicitud({ pedido: { origen: 'play' } }), null);
    assert.equal(CS.estimadoDeSolicitud({ pedido: null }), null);
    assert.equal(CS.estimadoDeSolicitud({ pedido: { estimado: { costo: 'x', total: 1 } } }), null);
    assert.equal(CS.estimadoDeSolicitud({ pedido: { estimado: { costo: 6000, total: 5000 } } }), null);
  });

  test('el 2% del módulo es el 2% que la base deja pasar', () => {
    const SQL = leer('base/20261019_el_estimado_viaja.sql').replace(/--[^\n]*/g, '');
    assert.match(SQL, new RegExp('v_cap \\* ' + String(CS.TASA_ESTIMADO_MENSUAL).replace('.', '\\.') + ' \\*'),
      'la base mide el estimado con otra tasa que la del módulo');
    assert.match(SQL, new RegExp('v_tasa > ' + String(CS.TASA_ESTIMADO_MENSUAL).replace('.', '\\.')));
  });
});

/* ==========================================================================
 * 4. LA CALCULADORA EN PANTALLA
 * ======================================================================== */
describe('la calculadora muestra el estimado, en pesos y rotulado', () => {

  test('con techo: «Costo estimado: $6.000 · Total estimado: $306.000» y el rótulo', () => {
    const t = visible(CS.html({ monto: 300000, dias: 30 }, { boton: 'Pedir {monto}', accion: 'x()', hoy: '2026-10-19' }));
    assert.match(t, /Costo estimado: \$6\.000 · Total estimado: \$306\.000/);
    assert.match(t, /Estimado: el costo exacto te lo mandamos en la propuesta, y puede ser distinto\./);
    assert.ok(!/\d\s*%/.test(t), 'la calculadora le muestra un porcentaje al cliente');
    assert.ok(!/tasa|efectiva|inter[eé]s/i.test(t), 'la calculadora habla de tasas al cliente');
  });

  test('sin techo: ninguna cifra de costo, y la frase de siempre', () => {
    const t = visible(CS.html({ monto: 300000, dias: 30 }, { hoy: '2026-06-01' }));
    assert.ok(!/Costo estimado|Total estimado/.test(t), 'sin techo certificado publicó un estimado');
    assert.match(t, /El costo exacto te lo mandamos en la propuesta, antes de que aceptes nada\./);
  });

  test('el estimado se mueve con el dedo: refrescar reescribe SOLO la caja del costo', () => {
    const els = {};
    const el = id => (els[id] = els[id] || { id, value: '', textContent: '', innerHTML: '', setAttribute() {},
      querySelectorAll: () => [], classList: { toggle() {} } });
    const W = { document: { getElementById: el } };
    delete require.cache[require.resolve('../app/calculadora-solicitud.js')];
    const M = require('../app/calculadora-solicitud.js');
    M.conectar(W);
    try {
      M.html({ monto: 300000, dias: 30 }, { hoy: '2026-10-19' });
      M.elegirMonto(1000000);
      assert.match(els.csCosto.innerHTML, /Costo estimado: \$20\.000 · Total estimado: \$1\.020\.000/);
      M.elegirDias(15);
      assert.match(els.csCosto.innerHTML, /Costo estimado: \$10\.000 · Total estimado: \$1\.010\.000/);
    } finally { M.conectar(null); delete require.cache[require.resolve('../app/calculadora-solicitud.js')]; }
  });
});

/* ==========================================================================
 * 5. play/ DE VERDAD
 * ======================================================================== */
function enLaPestanaCredito(prep) {
  const P = abrirPlay({});
  /* El día lo fija la prueba: la tabla de usura se vence a fin de mes, y una
     prueba que dependa de qué día se corre es una alarma, no una prueba. */
  P.ev('hoyISO = function () { return "2026-10-19"; };');
  if (prep) P.ev(prep);
  P.ev('SESION = { access_token: "t", user: { email: "573001112233@tugarantia.net", user_metadata: { perfil: "nuevo" } } };');
  P.ev('pintarCuenta(); irA("credito");');
  return P;
}
const calculadoraDe = h => {
  const i = h.indexOf('id="csCaja"'), j = h.indexOf('id="csError"', i);
  assert.ok(i >= 0 && j > i, 'no está la calculadora del pedido');
  return visible(h.slice(i, j));
};

describe('play/: el cliente ve el estimado y el estimado viaja', () => {

  test('la pestaña Crédito muestra el estimado de lo que pide, sin un porcentaje', () => {
    const P = enLaPestanaCredito();
    const t = calculadoraDe(P.elems.lamina.innerHTML);
    assert.match(t, /Costo estimado: \$6\.000 · Total estimado: \$306\.000/);
    assert.match(t, /Estimado: el costo exacto te lo mandamos en la propuesta, y puede ser distinto/);
    assert.ok(!/\d\s*%/.test(t), 'la calculadora del pedido le muestra un porcentaje: ' + (t.match(/.{0,30}\d\s*%.{0,20}/) || [])[0]);
  });

  test('la portada de play/ (antes de registrarse) también lo muestra', () => {
    const P = abrirPlay({});
    P.ev('hoyISO = function () { return "2026-10-19"; };');
    P.ev('pintarEntrar()');
    assert.match(calculadoraDe(P.elems.cuerpo.innerHTML), /Costo estimado: \$6\.000 · Total estimado: \$306\.000/);
  });

  test('con un techo bajo, la página muestra el estimado ya bajado', () => {
    const P = enLaPestanaCredito('CreditosPublicables.topeVigente = function () { return { desde: "2026-10-01", hasta: "2026-10-31", consumo_ordinario: 0.2436, fuente: "x" }; };');
    const t = calculadoraDe(P.elems.lamina.innerHTML);
    const m = t.match(/Costo estimado: \$([\d.]+)/);
    assert.ok(m, 'con techo bajo no mostró estimado');
    const costo = Number(m[1].replace(/\./g, ''));
    assert.ok(costo > 0 && costo < 6000, 'no bajó el estimado: ' + costo);
  });

  test('sin techo certificado, la página no muestra cifra', () => {
    const P = enLaPestanaCredito('CreditosPublicables.topeVigente = function () { return null; };');
    const t = calculadoraDe(P.elems.lamina.innerHTML);
    assert.ok(!/Costo estimado/.test(t), 'sin techo publicó un estimado');
    assert.match(t, /El costo exacto te lo mandamos en la propuesta, antes de que aceptes nada/);
  });

  /* La nube de mentira: anota cada llamada y contesta según la función. */
  const NUBE = (solicitar, anotar) =>
    'window.__l = []; fetch = function (u, o) { var c = JSON.parse(o.body); window.__l.push({ u: String(u), c: c });' +
    ' if (/anotar_estimado$/.test(String(u))) return Promise.resolve(' + anotar + ');' +
    ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(' + solicitar + '); } }); };';
  const SOL = c => '{ ok: true, solicitud: { id: 7, estado: "nueva", contrapropuesta: null, ' +
    'pedido: { origen: "play", capital: c.p_capital, fecha_pago: c.p_fecha_pago, dias: 30 } } }';
  const OK = '{ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }); } }';

  async function pedir(prep, nube) {
    const P = abrirPlay({});
    P.ev('hoyISO = function () { return "2026-10-19"; };');
    if (prep) P.ev(prep);
    P.ev(nube);
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarRegistrado();');
    P.ev('CalculadoraSolicitud.poner({ monto: 300000, dias: 30 }); pedirPrimerCredito();');
    await ticks();
    return { P, l: JSON.parse(P.ev('JSON.stringify(window.__l)')) };
  }

  test('al pedir, el estimado que vio viaja a anotar_estimado, DESPUÉS de pedir', async () => {
    const { l } = await pedir('', NUBE(SOL('c'), OK));
    const i = l.findIndex(x => /rpc\/solicitar_a_la_medida$/.test(x.u));
    const j = l.findIndex(x => /rpc\/anotar_estimado$/.test(x.u));
    assert.ok(i >= 0, 'no pidió');
    assert.ok(j > i, 'el estimado no viajó, o viajó antes de que existiera la solicitud: ' + JSON.stringify(l.map(x => x.u)));
    const c = l[j].c;
    assert.equal(c.p_id, 7);
    assert.equal(c.p_estimado.costo, 6000);
    assert.equal(c.p_estimado.total, 306000);
    assert.equal(c.p_estimado.capital, 300000);
    assert.equal(c.p_estimado.fecha_pago, l[i].c.p_fecha_pago, 'el estimado es de otra fecha que la pedida');
    assert.equal(c.p_estimado.tasa, 0.02);
    /* Pedir sigue siendo lo de siempre: el estimado NO va en solicitar_a_la_medida. */
    assert.deepEqual(Object.keys(l[i].c).sort(), ['p_capital', 'p_fecha_pago', 'p_nota']);
  });

  test('sin techo (no se mostró cifra), no viaja ningún estimado', async () => {
    const { l } = await pedir('CreditosPublicables.topeVigente = function () { return null; };', NUBE(SOL('c'), OK));
    assert.ok(l.some(x => /solicitar_a_la_medida$/.test(x.u)), 'no pidió');
    assert.ok(!l.some(x => /anotar_estimado$/.test(x.u)), 'le dijo a Joan que el cliente vio un estimado que no vio');
  });

  test('si ya había propuesta, lo pedido no cambió y no se anota nada', async () => {
    const { l } = await pedir('', NUBE('{ ok: true, ya_habia: true, solicitud: { id: 7, estado: "contrapropuesta", contrapropuesta: { capital: 300000 } } }', OK));
    assert.ok(!l.some(x => /anotar_estimado$/.test(x.u)), 'anotó un estimado sobre una solicitud que ya tiene propuesta');
  });

  test('con la base sin la migración nueva (404), el cliente no se entera: su solicitud ya llegó', async () => {
    const { P, l } = await pedir('', NUBE(SOL('c'), '{ ok: false, status: 404, json: function () { return Promise.resolve({}); } }'));
    assert.ok(l.some(x => /anotar_estimado$/.test(x.u)));
    assert.equal(String(P.elems.csError.textContent || ''), '', 'le mostró un error por algo que no es suyo');
    assert.match(P.elems.cuerpo.innerHTML, /Recibimos tu solicitud/);
  });
});

/* ==========================================================================
 * 6. index.html (la portada del sitio)
 * ======================================================================== */
describe('index.html: la portada del sitio también estima', () => {
  const I = leer('index.html');

  test('carga la tabla de usura antes de la calculadora', () => {
    /* 23-oct-2026 — sin la versión de la dirección (…?v=139, ver sw.js). */
    const srcs = [...I.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].split('?')[0]);
    const iC = srcs.indexOf('app/creditos.js'), iS = srcs.indexOf('app/calculadora-solicitud.js');
    assert.ok(iC >= 0, 'index.html no carga app/creditos.js: la calculadora no tiene contra qué techo medir y se calla');
    assert.ok(iC < iS, 'la tabla de usura va antes de la calculadora');
  });

  /* Su bloque de verdad, en un navegador de mentira. */
  function correrPortada(conCreditos) {
    const bloque = [...I.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
      .find(b => /CalculadoraSolicitud/.test(b));
    assert.ok(bloque, 'no encontré el bloque de la calculadora en index.html');
    const caja = { innerHTML: '' };
    const ctx = { document: { getElementById: id => (id === 'calcPedido' ? caja : null) },
                  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: {} };
    ctx.window = ctx;
    delete require.cache[require.resolve('../app/calculadora-solicitud.js')];
    ctx.CalculadoraSolicitud = require('../app/calculadora-solicitud.js');
    /* Un techo que vale cualquier día: la prueba no puede depender de que la
       tabla de verdad esté al día cuando se corra. */
    /* Sin ella, un objeto vacío: en Node el módulo encontraría la tabla con
       require(), y en un navegador no hay require. Vacío es «no llegó». */
    ctx.CreditosPublicables = conCreditos ? conTecho(0.2859) : {};
    vm.createContext(ctx);
    vm.runInContext(bloque, ctx);
    ctx.CalculadoraSolicitud.conectar(null);
    delete require.cache[require.resolve('../app/calculadora-solicitud.js')];
    return visible(caja.innerHTML);
  }

  test('con la tabla: «Costo estimado: $6.000 · Total estimado: $306.000»', () => {
    const t = correrPortada(true);
    assert.match(t, /Costo estimado: \$6\.000 · Total estimado: \$306\.000/);
    assert.ok(!/\d\s*%/.test(t));
  });

  test('si la tabla no llega, no hay cifra y queda la frase de siempre', () => {
    const t = correrPortada(false);
    assert.ok(!/Costo estimado/.test(t));
    assert.match(t, /El costo exacto te lo mandamos en la propuesta/);
  });
});
