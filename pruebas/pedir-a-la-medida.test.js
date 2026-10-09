/* ============================================================================
 * PEDIR LO QUE UNO QUIERA, Y LAS CONDICIONES DE LO QUE SE PROPONE
 * 8 de octubre de 2026.
 *
 * Lo que pidió Joan ese día, y lo que esta batería amarra para que no vuelva:
 *
 *   · «El correo es opcional, quiero que sea un requisito» — y la dirección,
 *     al revés: opcional, sin la frase «es la dirección del contrato y a donde
 *     se notifica».
 *   · «En cada pregunta hay un comentario y creo que no son necesarios» — se
 *     quitaron los de debajo de cada pregunta; se quedan los que pide la ley.
 *   · Los ingresos «separados con punto cuando es mil y con la coma cuando
 *     pase del millón»: 850.000 · 1,500.000 · 12,350.000.
 *   · «No quiero que se pregunte [si un asesor lo acompaña]: yo quiero siempre
 *     ver desde mi CRM» — vitrina.test.js, «EL ACOMPAÑAMIENTO, SIN PREGUNTAR».
 *   · «El cliente puede pedir lo que quiera y yo soy el encargado de darle una
 *     contrapropuesta… y que esta misma calculadora se vea al inicio» — la
 *     calculadora del pedido (app/calculadora-solicitud.js), SIN PRECIO.
 *   · «Al momento de la contrapropuesta que se le muestren los términos y
 *     condiciones de ese crédito en específico» — el bloque de condiciones, la
 *     casilla, y aceptar_condiciones (base/20261008_condiciones_aceptadas.sql;
 *     la base de verdad la prueba condiciones-aceptadas-postgres.test.js).
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay } = require('./banco-play.js');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const U = require('../app/cuenta.js');
const M = require('../app/motor.js');
const CS = require('../app/calculadora-solicitud.js');
const SQL = leer('base/20261008_condiciones_aceptadas.sql');
const sinComentariosSQL = t => t.replace(/--[^\n]*/g, '');

const tick = () => new Promise(r => setImmediate(r));
const ticks = async () => { for (let i = 0; i < 6; i++) await tick(); };

/* ==========================================================================
 * 1. EL FORMULARIO
 * ======================================================================== */
describe('el formulario del 8-oct: correo, dirección y pesos', () => {

  test('el correo es obligatorio y tiene que tener forma de correo', () => {
    const c = U.CAMPOS.find(x => x.id === 'correo');
    assert.equal(c.obligatorio, true);
    ['ana@correo.com', 'juan.perez@gmail.com', ' ana@correo.co '].forEach(v =>
      assert.equal(U.correoValido(v), true, v + ' es un correo'));
    ['ana', 'ana@', 'ana@correo', '@correo.com', 'ana @correo.com', 'ana@correo.c'].forEach(v =>
      assert.equal(U.correoValido(v), false, v + ' no es un correo'));
    const r = U.revisarVinculacion({ correo: 'ana@' });
    assert.ok(r.errores.some(e => e.id === 'correo'), 'un correo a medias pasó');
  });

  test('la dirección es opcional y ya no promete un domicilio de notificación', () => {
    const c = U.CAMPOS.find(x => x.id === 'direccion');
    assert.equal(c.obligatorio, false);
    assert.ok(!/contrato|notific/i.test(c.porque), 'volvió «es la dirección del contrato y a donde se notifica»');
    assert.equal(U.revisarVinculacion({}).faltan.some(f => f.id === 'direccion'), false);
  });

  test('los pesos: punto para los miles, coma para los millones (como los pidió Joan)', () => {
    assert.equal(U.pesosConSeparadores('850000'), '850.000');
    assert.equal(U.pesosConSeparadores('1500000'), '1,500.000');
    assert.equal(U.pesosConSeparadores('12350000'), '12,350.000');
    assert.equal(U.pesosConSeparadores('999'), '999');
    assert.equal(U.pesosConSeparadores('1.500.000'), '1,500.000', 'lo que ya traía puntos se reescribe');
    assert.equal(U.pesosConSeparadores('0001500'), '1.500');
    assert.equal(U.pesosConSeparadores(''), '');
    /* Y el camino de vuelta da el número, no la cadena pintada. */
    assert.equal(U.leerPesos('1,500.000'), 1500000);
    assert.equal(U.leerPesos('12,350.000'), 12350000);
    /* La regla de antes sigue aceptando lo pintado: lo que importa son los dígitos. */
    assert.equal(U.revisarVinculacion({ ingreso_mes: '1,500.000' }).errores.some(e => e.id === 'ingreso_mes'), false);
  });

  test('en pantalla: la pregunta de ingresos se pinta y se anota con separadores, y guarda DÍGITOS', () => {
    const P = abrirPlay({});
    P.ev('REGISTRO.ingreso_mes = "1500000"; pintarRegistro(6);');
    const h = P.elems.cuerpo.innerHTML;
    /* 8-oct-2026 (segunda vuelta): con `event`, para saber si la cifra se pegó
       (los centavos de «1.500.000,00» se quitan solo al pegar). */
    assert.match(h, /id="f_ingreso_mes"[^>]*oninput="anotarPesos\(this, event\)"/, 'el ingreso no se formatea mientras se escribe');
    assert.match(h, /id="f_ingreso_mes"[^>]*value="1,500\.000"/, 'el ingreso guardado no se pinta con separadores');
    P.ev('var el = document.getElementById("f_gastos_mes"); el.value = "2350000"; anotarPesos(el);');
    assert.equal(P.ev('document.getElementById("f_gastos_mes").value'), '2,350.000');
    assert.equal(P.ev('REGISTRO.gastos_mes'), '2350000', 'al CRM tiene que viajar el número, no la cadena pintada');
    assert.match(String(P.almacen.play_registro_borrador || ''), /"gastos_mes":"2350000"/);
  });

  test('las preguntas ya no llevan su comentario debajo', () => {
    const P = abrirPlay({});
    ['identidad', 'contacto', 'domicilio', 'ingresos', 'referencias'].forEach(g => {
      const h = P.ev('pasoCampos("' + g + '")');
      assert.ok(!/class="ayuda"/.test(h), 'el grupo «' + g + '» volvió a llevar comentarios debajo de las preguntas');
      U.camposDelGrupo(g).forEach(c => assert.ok(h.indexOf(c.porque) < 0, 'se pinta el porqué de «' + c.id + '»'));
    });
    /* En el paso 1 se fueron los dos de siempre; queda el que no es comentario
       (con la contraseña ya creada, el campo se puede dejar en blanco) y el
       aviso del acompañamiento, que es el que pide la ley. */
    const e = P.ev('CLAVE_EN_MEMORIA = ""; pasoEntrada()');
    assert.ok(!/Son 10 números y empiezan por 3/.test(e), 'volvió el comentario del celular');
    assert.ok(!/Mínimo 8 caracteres/.test(e), 'volvió el comentario de la contraseña');
    assert.match(e, /id="avisoAcompana"/);
    assert.match(P.ev('CLAVE_EN_MEMORIA = "Perro.2026x"; pasoEntrada()'), /Déjalo en blanco para seguir con la misma/);
  });

  test('lo que la ley pide sigue en el último paso: la autorización y la de las fotos aparte', () => {
    const P = abrirPlay({});
    const h = P.ev('pasoPermiso()');
    assert.match(h, /Autorizo el tratamiento de mis datos personales/);
    assert.match(h, /Esto es aparte y es opcional/);
    assert.match(h, /Lo que esta app NO te pide/);
  });
});

/* ==========================================================================
 * 2. LA CALCULADORA DEL PEDIDO
 * ======================================================================== */
describe('la calculadora del pedido (app/calculadora-solicitud.js)', () => {

  test('sus límites son los del motor y los de la base, no unos escritos a mano', () => {
    assert.equal(CS.MONTO_MIN, M.MONTO_MINIMO, 'el piso se separó del motor');
    assert.equal(CS.MONTO_MAX_DESLIZADOR, M.MONTO_MAXIMO_CALCULADORA, 'el deslizador llega a otro tope que el motor');
    const sql = sinComentariosSQL(SQL);
    assert.match(sql, new RegExp('p_capital < ' + CS.MONTO_MIN + '\\b'), 'la base pone otro piso');
    assert.match(sql, new RegExp('p_capital > ' + CS.MONTO_MAX + '\\b'), 'la base pone otro techo');
    /* Y el techo es lo que Joan puede contraproponer: pedir más no tendría respuesta. */
    assert.match(leer('base/20261005_platachat_solicitud.sql'), /p_capital > 20000000/);
    assert.equal(CS.MONTO_MAX, 20000000);
    assert.match(sql, /p_fecha_pago > hoy \+ 366/);
    assert.ok(CS.DIAS_MAX <= 366 && CS.DIAS_MIN >= 1);
  });

  test('NO PUBLICA NINGÚN PRECIO y dice que el costo llega en la propuesta', () => {
    const h = CS.html({ monto: 1500000, dias: 37 }, { boton: 'Pedir {monto}', accion: 'x()', conNota: true, hoy: '2026-10-08' })
      .replace(/<style>[\s\S]*?<\/style>/g, '');
    const texto = h.replace(/<[^>]+>/g, ' ');
    assert.match(texto, /El costo exacto te lo mandamos en la propuesta, antes de que aceptes nada\./);
    [/\d\s*%/, /cuota de/i, /costo total/i, /tasa/i, /total a pagar/i, /devuelves/i, /quincen/i, /inter[eé]s/i]
      .forEach(p => assert.equal(p.test(texto), false, 'la calculadora del pedido publica algo de precio: ' + (texto.match(p) || [])[0]));
    /* 8-oct-2026 (segunda vuelta): lo que se MUESTRA va como en todo el sitio
       ($1.500.000); la forma de Joan (1,500.000) queda en lo que se TECLEA. La
       revisión del teléfono encontró las dos formas en la misma pantalla. */
    assert.match(texto, /Pedir \$1\.500\.000/);
  });

  test('el resumen dice cuánto y el día del calendario, en palabras', () => {
    assert.equal(CS.resumen({ monto: 1500000, dias: 37 }, '2026-10-08'),
      'Pides $1.500.000 para pagar el sábado 14 de noviembre de 2026, en 37 días.');
    assert.equal(CS.resumen({ monto: 300000, dias: 30 }, '2026-10-08'),
      'Pides $300.000 para pagar el sábado 7 de noviembre de 2026, en 1 mes (30 días).');
  });

  test('lo que se manda es la FECHA, no los días (leído mañana serían otros)', () => {
    const p = CS.pedidoParaEnviar({ monto: 700000, dias: 10 }, '2026-10-08', '  surtir   la tienda ');
    assert.deepEqual(p, { p_capital: 700000, p_fecha_pago: '2026-10-18', p_nota: 'surtir la tienda' });
    assert.equal(CS.pedidoParaEnviar({ monto: 700000, dias: 10 }, '2026-10-08', '').p_nota, null);
  });

  test('se pinza a sus límites y el deslizador encuentra la posición más cercana', () => {
    assert.deepEqual(CS.normalizar({ monto: 10, dias: 999 }), { monto: CS.MONTO_MIN, dias: CS.DIAS_MAX });
    assert.deepEqual(CS.normalizar({ monto: 99000000, dias: 0 }), { monto: CS.MONTO_MAX, dias: 30 });
    assert.equal(CS.montoDeIndice(CS.indiceDeMonto(300000)), 300000);
    assert.equal(CS.MONTOS[0], CS.MONTO_MIN);
    assert.equal(CS.MONTOS[CS.MONTOS.length - 1], CS.MONTO_MAX_DESLIZADOR);
    /* Lo pequeño, que es lo que más se pide, ocupa media barra: hasta un millón. */
    assert.ok(CS.indiceDeMonto(1000000) >= CS.MONTOS.length * 0.45, 'los montos chicos quedaron apretados en un rincón');
  });

  test('lo que se movió antes de registrarse se guarda (solo monto y días) y vence en una semana', () => {
    const viejo = globalThis.localStorage;
    const caja = {};
    globalThis.localStorage = { getItem: k => (k in caja ? caja[k] : null), setItem: (k, v) => { caja[k] = String(v); }, removeItem: k => { delete caja[k]; } };
    try {
      const ahora = Date.parse('2026-10-08T12:00:00Z');
      /* 8-oct-2026 (segunda vuelta): se guarda también LA FECHA, y al leerla
         otro día los días se cuentan desde ese día. Guardaba «15 días» y al
         día siguiente seguían siendo 15: la fecha escogida corría sola. */
      assert.equal(CS.guardar({ monto: 800000, dias: 15 }, ahora, '2026-10-08'), true);
      assert.deepEqual(Object.keys(JSON.parse(caja[CS.LLAVE])).sort(), ['dias', 'fecha', 'monto', 't'],
        'se guardó algo más que monto, fecha y días');
      assert.equal(JSON.parse(caja[CS.LLAVE]).fecha, '2026-10-23');
      assert.deepEqual(CS.leerGuardado(ahora + 86400000, '2026-10-09'), { monto: 800000, dias: 14 },
        'leído al otro día, la fecha escogida se corrió');
      assert.equal(CS.leerGuardado(ahora + 8 * 86400000), null, 'un pedido de hace más de una semana se retomó');
    } finally { if (viejo === undefined) delete globalThis.localStorage; else globalThis.localStorage = viejo; }
  });

  test('el pulgar: controles de 44 px o más y nada se anima con quien pidió menos movimiento', () => {
    const h = CS.html({ monto: 300000, dias: 30 }, {});
    assert.match(h, /\.cs \.cs-chip\{min-height:44px/);
    assert.match(h, /\.cs \.cs-mas\{flex:none;width:48px;height:48px/);
    assert.match(h, /input\[type=range\]\{[^}]*height:44px/);
    assert.match(h, /prefers-reduced-motion:reduce/);
  });
});

/* ==========================================================================
 * 3. LA CALCULADORA EN play/ Y EN LA PORTADA DEL SITIO
 * ======================================================================== */
describe('la calculadora del pedido, en play/ y en index.html', () => {

  test('la portada de play/ la pinta (y no la del producto a 6 meses)', () => {
    const P = abrirPlay({});
    P.ev('pintarEntrar()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /id="csMonto"/);
    assert.match(h, /onclick="pedirDesdeLaPortada\(\)">Abrir mi cuenta y pedirlo</);
    assert.ok(!/id="calcMonto"/.test(h), 'volvió la calculadora con precio a la portada');
    assert.ok(!/y cada uno te decimos para qué es/.test(h), 'la portada promete los comentarios que se quitaron');
  });

  test('al terminar el registro se pide con la calculadora, con lo que se movió en la portada', () => {
    const P = abrirPlay({ almacen: { tg_pedido_calc: JSON.stringify({ monto: 850000, dias: 20, t: Date.now() }) } });
    P.ev('pintarRegistrado()');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /onclick="pedirPrimerCredito\(\)">Pedir \$850\.000</, 'no trae lo que la persona movió antes de registrarse');
    assert.match(h, /id="csNota"/);
  });

  test('pedir manda monto y FECHA a solicitar_a_la_medida, y muestra lo pedido', async () => {
    const P = abrirPlay({});
    P.ev('window.__l = []; fetch = function (u, o) { var c = JSON.parse(o.body); window.__l.push({ u: String(u), c: c });' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, solicitud: ' +
         '{ id: 7, estado: "nueva", contrapropuesta: null, pedido: { origen: "play", capital: c.p_capital, fecha_pago: c.p_fecha_pago, dias: 12 }, pedido_nota: c.p_nota } }); } }); };');
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarRegistrado();');
    P.ev('CalculadoraSolicitud.poner({ monto: 700000, dias: 12 }); pedirPrimerCredito();');
    await ticks();
    const l = JSON.parse(P.ev('JSON.stringify(window.__l)'));
    const pedido = l.find(x => /rpc\/solicitar_a_la_medida$/.test(x.u));
    assert.ok(pedido, 'no fue a solicitar_a_la_medida: ' + JSON.stringify(l.map(x => x.u)));
    assert.equal(pedido.c.p_capital, 700000);
    assert.match(pedido.c.p_fecha_pago, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!l.some(x => /solicitar_primer_credito/.test(x.u)), 'volvió a pedir la propuesta automática');
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /Recibimos tu solicitud/);
    assert.match(h, /Pediste <b>\$700\.000<\/b> para pagar el <b>/);
    assert.match(h, /Todavía no es un crédito/);
  });

  test('con la migración sin correr (404) no culpa al internet y ofrece mandarlo por el chat', async () => {
    const P = abrirPlay({});
    P.ev('fetch = function () { return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } }); };');
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarRegistrado(); pedirPrimerCredito();');
    await ticks();
    assert.match(P.elems.csError.textContent, /todavía no está encendido de nuestro lado/);
    assert.ok(!/internet/.test(P.elems.csError.textContent.replace('no es tu teléfono ni tu internet', '')));
    assert.match(P.elems.pedirSalida.innerHTML, /pedirPorElChat\(\)/);
  });

  test('cada motivo de la base tiene su frase', () => {
    const P = abrirPlay({});
    assert.match(P.ev('motivoDelPedido({ motivo: "minimo", minimo: 50000 })'), /\$50\.000/);
    /* 8-oct-2026 (segunda vuelta): la cifra mostrada va como en todo el sitio, y
       el plazo llega a seis meses (lo más que el CRM sabe proponer). */
    assert.match(P.ev('motivoDelPedido({ motivo: "maximo", maximo: 20000000 })'), /\$20\.000\.000/);
    assert.match(P.ev('motivoDelPedido({ motivo: "fecha" })'), /entre mañana y dentro de seis meses/);
    assert.match(P.ev('motivoDelPedido({ motivo: "muchas" })'), /varias solicitudes/);
  });

  test('la pestaña Crédito pide igual, y ya no ofrece el simulador con precio', () => {
    const P = abrirPlay({});
    P.ev('SESION = { access_token: "t", user: { email: "573001112233@tugarantia.net", user_metadata: { perfil: "nuevo" } } };');
    P.ev('pintarCuenta(); irA("credito");');
    const h = P.elems.lamina.innerHTML;
    assert.match(h, /onclick="enviarPedido\(\)">Pedir /);
    assert.ok(!/id="rMonto"|Tasa efectiva anual<\/span><span class="v">[\d,]+%<\/span><\/div><details[^>]*data-plan="simulador"/.test(h),
      'volvió el simulador del producto a 6 meses');
    assert.ok(!/simular y dejar tu solicitud/.test(h));
  });

  test('una solicitud que espera propuesta se ve en la pestaña Crédito', async () => {
    const P = abrirPlay({});
    P.ev('fetch = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, solicitud: ' +
         '{ id: 7, estado: "nueva", contrapropuesta: null, pedido: { origen: "play", capital: 900000, fecha_pago: "2026-11-20", dias: 43 }, pedido_nota: "<b>x</b>" } }); } }); };');
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarCuenta(); irA("credito");');
    await ticks();
    const h = P.elems.solicitudBox.innerHTML;
    assert.match(h, /Pediste <b>\$900\.000<\/b> para pagar el <b>viernes 20 de noviembre de 2026<\/b>/);
    assert.ok(h.indexOf('<b>x</b>') < 0 && h.indexOf('&lt;b&gt;x&lt;/b&gt;') >= 0, 'la nota del cliente se pinta sin escapar');
  });

  test('index.html carga la calculadora, guarda lo movido y lleva al registro', () => {
    const I = leer('index.html');
    const srcs = [...I.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
    assert.deepEqual(srcs, ['app/cuenta.js', 'app/calculadora-solicitud.js'], 'cuenta.js va antes: es quien escribe los pesos');
    assert.match(I, /id="calcPedido"/);
    assert.match(I, /location\.href = 'play\/#registro'/);
    assert.match(I, /<a class="btn btn-rojo" href="play\/#registro">Abrir mi cuenta y pedirlo<\/a>/, 'sin JavaScript no queda el enlace al registro');
    /* Lo que la calculadora volvió falso, ya no se dice. */
    const sinComentarios = I.replace(/<!--[\s\S]*?-->/g, '');
    [/devuelves \$240\.000/, /cuánto costaría tu crédito/, /Calculas antes de pedir/, /te escribimos\s+por WhatsApp/]
      .forEach(p => assert.equal(p.test(sinComentarios), false, 'la portada del sitio sigue diciendo: ' + (sinComentarios.match(p) || [])[0]));
  });
});

/* ==========================================================================
 * 4. LAS CONDICIONES DE ESTE CRÉDITO
 * ======================================================================== */
const PROPUESTA = { id: 9, estado: 'contrapropuesta',
  contrapropuesta: { capital: 1500000, costo: 300000, total: 1800000, fecha_pago: '2026-11-14', dias: 37,
                     costo_pct: 20, texto: 'Te propongo esto', por: 'joan', creada_en: '2026-10-08T15:00:00Z' } };
const A_CUOTAS = { id: 10, estado: 'contrapropuesta',
  contrapropuesta: { capital: 1000000, costo: 71154, total: 1071154, producto: 'respaldado', meses: 3,
                     fecha_pago: '2027-01-15', por: 'joan', creada_en: '2026-10-08T15:00:00Z',
                     cuotas: [{ numero: 1, fecha: '2026-11-15', total: 357052 }, { numero: 2, fecha: '2026-12-15', total: 357051 },
                              { numero: 3, fecha: '2027-01-15', total: 357051 }] } };

describe('las condiciones de este crédito', () => {

  test('un solo pago: recibe, paga, total, costo, garantía, atraso negociable, cómo paga, cuándo recibe', () => {
    const c = CS.condiciones(PROPUESTA, { hoy: '2026-10-08' });
    const v = k => (c.lineas.find(l => l.clave === k) || {}).v || '';
    /* 8-oct-2026 (segunda vuelta): las condiciones MUESTRAN pesos como el resto
       del sitio ($1.500.000); la forma de Joan queda para lo que se teclea. */
    assert.equal(v('recibes'), '$1.500.000');
    assert.equal(v('pagas'), 'Un solo pago de $1.800.000 el sábado 14 de noviembre de 2026, en 37 días');
    assert.equal(v('total'), '$1.800.000');
    assert.match(v('costo'), /^\$300\.000, ya sumado en el total/);
    assert.match(v('garantia'), new RegExp('\\$' + CS.soloPesos(M.acumularGarantia(300000, true)).replace(/[.,]/g, m => '\\' + m) + ' de garantía'));
    assert.match(v('atraso'), /se puede negociar/);
    assert.match(v('atraso'), /Estamos para darte soluciones/);
    assert.match(v('como'), /Nequi o transferencia/);
    assert.match(v('entrega'), /Aceptar no te entrega la plata/);
    assert.equal(c.capital, 1500000); assert.equal(c.total, 1800000);
    assert.match(c.texto, /^Las condiciones de este crédito\n- Recibes: \$1\.500\.000/);
  });

  /* 8-oct-2026 (segunda vuelta) — ANTES: «si se atrasa NO lleva una cifra».
     Las revisiones de ley y del teléfono encontraron que así el recargo no
     estaba en NINGUNA parte: las condiciones decían «como explican los
     términos» y los términos «está en las condiciones». Ahora lleva su cifra
     en pesos por día, y es el TECHO LEGAL (la tasa de usura del mes, de
     app/creditos.js), nunca el 1% diario del motor, que no cabe bajo ese techo. */
  test('si se atrasa lleva el techo legal EN PESOS por día, nunca la tasa del motor ni un porcentaje', () => {
    const C = require('../app/creditos.js');
    const c = CS.condiciones(PROPUESTA, { hoy: '2026-10-08' });
    const atraso = c.lineas.find(l => l.clave === 'atraso').v;
    const techo = C.topeDeReferencia('2026-10-08').tope;
    const legalPorDia = 1500000 * (Math.pow(1 + techo, 1 / 365) - 1);
    assert.ok(c.tope_mora, 'las condiciones no traen el techo del recargo');
    assert.equal(c.tope_mora.ea, techo, 'el techo no es el de la tabla de usura del día');
    assert.ok(c.tope_mora.por_dia <= Math.ceil(legalPorDia), 'el recargo publicado pasa el techo legal');
    assert.ok(c.tope_mora.por_dia < 1500000 * M.TASA_MORA_DIARIA, 'se publicó la tasa del motor');
    assert.ok(atraso.indexOf('hasta ' + CS.pesos(c.tope_mora.por_dia)) >= 0, 'el renglón no dice la cifra: ' + atraso);
    assert.match(atraso, /lo más que permite la ley/);
    assert.ok(!/como explican los términos/.test(atraso), 'volvió a mandar a los términos');
    assert.ok(!/%/.test(c.texto), 'las condiciones muestran un porcentaje');
    /* Y no promete un descuento en particular. */
    assert.ok(!/descuento de|te perdonamos|sin recargo/i.test(atraso));
    /* Lo que viaja con la aceptación lleva el techo, para que el CRM lo compare. */
    assert.deepEqual(CS.paraAceptar(c).tope_mora, c.tope_mora);
  });

  test('lo publicado y lo que cobra el CRM son la misma cuenta (puente.tasaMoraDe)', () => {
    const PU = require('../app/puente.js');
    const C = require('../app/creditos.js');
    const tope = CS.topeDeMora(600000, '2026-10-08');
    const credito = { id: 'P1', capital: 600000, costoPct: 20, fechaDesembolso: '2026-10-08', cicloActual: '2026-11-07',
                      prorrogas: [], abonosCapital: [], pagado: false, topeMoraEA: C.topeDeReferencia('2026-10-08').tope };
    const diez = PU.liquidarCiclo(credito, '2026-11-17').recargo_mora;
    assert.ok(diez <= tope.por_dia * 10, 'el CRM cobra más de lo que dicen las condiciones: ' + diez + ' > ' + tope.por_dia * 10);
    assert.equal(PU.tasaMoraDe(credito, '2026-11-17'), tope.diaria);
    /* Un crédito SIN techo (los de antes) sigue con la regla del motor: eso lo decide Joan. */
    const viejo = Object.assign({}, credito); delete viejo.topeMoraEA;
    assert.equal(PU.liquidarCiclo(viejo, '2026-11-17').recargo_mora, Math.round(600000 * M.TASA_MORA_DIARIA * 10));
    assert.equal(PU.tasaMoraDe(viejo), null);
  });

  test('a cuotas: cada cuota con su monto y su fecha, y la garantía del producto con garantía', () => {
    const c = CS.condiciones(A_CUOTAS, { hoy: '2026-10-08' });
    assert.equal(c.cuotas, 3);
    assert.equal(c.lineas.find(l => l.clave === 'cuota1').v, '$357.052 el domingo 15 de noviembre de 2026');
    assert.equal(c.lineas.find(l => l.clave === 'cuota3').v, '$357.051 el viernes 15 de enero de 2027');
    assert.match(c.lineas.find(l => l.clave === 'garantia').v,
      new RegExp('\\$' + CS.soloPesos(M.acumularGarantiaRespaldada(71154, true)).replace(/[.,]/g, m => '\\' + m)));
    assert.ok(!c.lineas.some(l => /Un solo pago/.test(l.v)), 'una propuesta a cuotas se dice como pago único');
  });

  test('la casilla se acuerda por solicitud Y por propuesta', () => {
    const otra = JSON.parse(JSON.stringify(PROPUESTA));
    otra.contrapropuesta.total = 1700000;
    assert.notEqual(CS.llaveDeCasilla(PROPUESTA), CS.llaveDeCasilla(otra), 'la marca de la propuesta vieja valdría para la nueva');
    const p = CS.paraAceptar(CS.condiciones(PROPUESTA, { hoy: '2026-10-08' }));
    /* 8-oct-2026 (segunda vuelta): viajan también el sello de la propuesta
       (creada_en: la base no acepta otra con la misma plata y otra fecha) y el
       techo del recargo que se le mostró. */
    assert.deepEqual(Object.keys(p).sort(), ['capital', 'creada_en', 'fecha_pago', 'lineas', 'texto', 'tope_mora', 'total', 'version']);
    assert.equal(p.version, '2026-10-08');
    assert.equal(p.creada_en, '2026-10-08T15:00:00Z');
  });

  test('play/: la propuesta trae las condiciones y el «Acepto» no se toca sin la casilla', () => {
    const P = abrirPlay({});
    const h = P.ev('tarjetaContrapropuesta(' + JSON.stringify(PROPUESTA) + ')');
    assert.match(h, /Las condiciones de este crédito/);
    assert.match(h, /<input type="checkbox" id="condLeidas" onchange="marcarCondiciones\(this\.checked\)">/);
    /* 8-oct-2026 (segunda vuelta): APAGADO PERO NO MUDO. Con `disabled` el toque
       no hacía nada y no decía por qué (la revisión del teléfono lo probó);
       ahora va aria-disabled, se puede tocar y dice qué falta. */
    assert.match(h, /id="btnAceptar" onclick="aceptarContrapropuesta\(9\)" aria-disabled="true"[^>]*>Acepto: recibo \$1\.500\.000 y devuelvo \$1\.800\.000</);
    assert.ok(!/id="btnAceptar"[^>]*\sdisabled[\s>]/.test(h), 'el botón volvió a estar mudo (disabled)');
    assert.match(h, /id="faltaCasilla"[^>]*>Para aceptar, marca primero la casilla de arriba\./);
    assert.ok(!/\d\s*%/.test(h.replace(/<style>[\s\S]*?<\/style>/g, '')), 'la propuesta le muestra un porcentaje');
    P.ev('marcarCondiciones(true)');
    assert.match(P.ev('tarjetaContrapropuesta(' + JSON.stringify(PROPUESTA) + ')'), /onclick="aceptarContrapropuesta\(9\)">Acepto/,
      'marcada la casilla, el botón tiene que nacer prendido al repintar');
  });

  test('play/: aceptar sin la casilla no llama a nadie; con ella, aceptar_condiciones con lo que vio', async () => {
    const P = abrirPlay({});
    P.ev('window.__l = []; fetch = function (u, o) { window.__l.push({ u: String(u), c: JSON.parse(o.body) });' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, solicitud: ' +
         JSON.stringify(Object.assign({}, PROPUESTA, { estado: 'aceptada' })) + ' }); } }); };');
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarSolicitud(' + JSON.stringify(PROPUESTA) + ');');
    P.ev('aceptarContrapropuesta(9)');
    await ticks();
    assert.equal(JSON.parse(P.ev('JSON.stringify(window.__l)')).length, 0, 'aceptó sin la casilla');
    assert.match(P.elems.errAceptar.textContent, /Marca la casilla/);
    P.ev('marcarCondiciones(true); aceptarContrapropuesta(9);');
    await ticks();
    const l = JSON.parse(P.ev('JSON.stringify(window.__l)'));
    const a = l.find(x => /rpc\/aceptar_condiciones$/.test(x.u));
    assert.ok(a, 'no aceptó con aceptar_condiciones');
    assert.equal(a.c.p_id, 9);
    assert.equal(a.c.p_vio.capital, 1500000);
    assert.equal(a.c.p_vio.total, 1800000);
    assert.match(a.c.p_vio.texto, /Si te atrasas: .*se puede negociar/);
    /* 8-oct-2026 (segunda vuelta): y el sello y la fecha de LA propuesta que leyó. */
    assert.equal(a.c.p_vio.creada_en, '2026-10-08T15:00:00Z');
    assert.equal(a.c.p_vio.fecha_pago, '2026-11-14');
    assert.match(P.elems.cuerpo.innerHTML, /Listo: aceptaste \$1\.500\.000\./);
  });

  /* 8-oct-2026 (segunda vuelta) — ANTES: «con la migración sin correr, se
     acepta con la de siempre». Las revisiones de ley y de seguridad lo
     marcaron: esa aceptación no guardaba nada de lo leído, mientras los
     términos prometen «guardamos una copia tal como las viste». Ahora con 404
     NO se acepta, y se dice. */
  test('play/: con la migración del 8-oct sin correr, NO se acepta sin constancia, y se dice', async () => {
    const P = abrirPlay({});
    P.ev('window.__l = []; fetch = function (u, o) { var s = String(u); window.__l.push(s);' +
         ' if (/aceptar_condiciones/.test(s)) return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, solicitud: ' +
         JSON.stringify(Object.assign({}, PROPUESTA, { estado: 'aceptada' })) + ' }); } }); };');
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarSolicitud(' + JSON.stringify(PROPUESTA) + ');');
    P.ev('marcarCondiciones(true); aceptarContrapropuesta(9);');
    await ticks();
    const l = JSON.parse(P.ev('JSON.stringify(window.__l)'));
    assert.ok(!l.some(u => /aceptar_contrapropuesta$/.test(u)), 'con 404 aceptó por la puerta que no guarda nada: ' + JSON.stringify(l));
    assert.ok(!/Listo: aceptaste/.test(P.elems.cuerpo.innerHTML), 'dijo «aceptaste» sin constancia');
    assert.match(P.elems.errAceptar.textContent, /No pudimos registrar tu aceptación/);
  });

  test('play/: si la propuesta cambió mientras leía, no se acepta y se muestra la nueva sin la casilla', async () => {
    const nueva = JSON.parse(JSON.stringify(PROPUESTA));
    nueva.contrapropuesta.total = 1750000; nueva.contrapropuesta.creada_en = '2026-10-08T16:00:00Z';
    const P = abrirPlay({});
    P.ev('fetch = function (u) { var s = String(u);' +
         ' var r = /aceptar_condiciones/.test(s) ? { ok: false, motivo: "cambio" } : { ok: true, solicitud: ' + JSON.stringify(nueva) + ' };' +
         ' return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(r); } }); };');
    P.ev('SESION = { access_token: "t", user: { user_metadata: {} } }; pintarSolicitud(' + JSON.stringify(PROPUESTA) + ');');
    P.ev('marcarCondiciones(true); aceptarContrapropuesta(9);');
    await ticks();
    const h = P.elems.cuerpo.innerHTML;
    assert.match(h, /La propuesta cambió mientras la leías/);
    assert.match(h, /devuelvo \$1\.750\.000/);
    assert.match(h, /id="btnAceptar" onclick="aceptarContrapropuesta\(9\)" aria-disabled="true"/, 'la marca de la propuesta vieja valió para la nueva');
  });
});

/* ==========================================================================
 * 5. LA BASE (la letra; la de verdad la corre condiciones-aceptadas-postgres)
 * ======================================================================== */
describe('base/20261008_condiciones_aceptadas.sql, la letra', () => {
  const sql = sinComentariosSQL(SQL);

  test('la tabla nueva con RLS, sin políticas, cerrada y de solo agregar', () => {
    assert.match(sql, /create table if not exists public\.condiciones_aceptadas/);
    assert.match(sql, /alter table public\.condiciones_aceptadas enable row level security/);
    assert.ok(!/create policy/i.test(sql), 'una política le abre la tabla a alguien');
    assert.match(sql, /revoke all on table public\.condiciones_aceptadas from public, anon, authenticated/);
    assert.match(sql, /before update on public\.condiciones_aceptadas/);
  });

  test('las dos funciones: security definer, search_path fijo, volátiles, y solo con sesión', () => {
    ['solicitar_a_la_medida', 'aceptar_condiciones'].forEach(fn => {
      const i = sql.indexOf('create or replace function public.' + fn + '(');
      assert.ok(i > 0, 'no está ' + fn);
      const cab = sql.slice(i, sql.indexOf('as $$', i));
      assert.match(cab, /security definer/, fn + ' sin security definer');
      assert.match(cab, /set search_path = public/, fn + ' sin search_path');
      assert.match(cab, /volatile/, fn + ' sin volatile: PostgREST la serviría en solo lectura');
    });
    assert.match(sql, /grant\s+execute on function public\.solicitar_a_la_medida\(bigint, date, text\) to authenticated;/);
    assert.match(sql, /grant\s+execute on function public\.aceptar_condiciones\(bigint, jsonb\) to authenticated;/);
    assert.ok(!/to anon/.test(sql), 'algo de esto quedó para la llave pública');
  });

  test('no se reescribe ninguna función viva: aceptar llama a las de siempre', () => {
    ['aceptar_contrapropuesta', 'aceptar_propuesta_platachat', 'solicitar_primer_credito', 'mi_solicitud', 'contrapropuesta_solicitud']
      .forEach(fn => assert.ok(!new RegExp('create or replace function public\\.' + fn + '\\(').test(sql), 'se reescribió ' + fn));
    assert.match(sql, /res := public\.aceptar_propuesta_platachat\(p_id\);/);
    assert.match(sql, /res := public\.aceptar_contrapropuesta\(p_id\);/);
    /* Bajo candado de la fila, y comparando las cifras que se vieron. */
    assert.match(sql, /for update;/);
    assert.match(sql, /'motivo', 'cambio'/);
  });

  test('pedir nace «nueva», SIN propuesta automática, y al cliente no se le devuelven datos de Joan', () => {
    const i = sql.indexOf('create or replace function public.solicitar_a_la_medida(');
    const cuerpo = sql.slice(i, sql.indexOf('$$;', i));
    assert.ok(!/contrapropuesta_de\(/.test(cuerpo), 'pedir le arma una propuesta automática: eso lo hace Joan');
    assert.match(cuerpo, /'nueva', 'tugarantia'/);
    assert.match(cuerpo, /'origen', 'play'/);
    (cuerpo.match(/to_jsonb\(s\)[^,)]*/g) || []).forEach(t =>
      assert.match(t, /- 'datos' - 'registro_id' - 'responsable'/, 'devuelve campos de Joan: ' + t));
  });
});

/* ==========================================================================
 * 6. EL CRM: el plazo pedido, «Proponer», y lo aceptado
 * ======================================================================== */
describe('la bandeja del CRM con el pedido a la medida', () => {

  const pedidoPlay = { id: 31, cedula: '3001234567', nombre: 'Ana <script>', estado: 'nueva', app: 'tugarantia',
    capital: 700000, tasa: 0, costo: 0, total: 0, fecha_corte: '2099-01-20', producto: 'quincenal',
    contrapropuesta: null, pedido: { origen: 'play', capital: 700000, fecha_pago: '2099-01-20', dias: 30 },
    pedido_monto: 700000, pedido_nota: 'surtir', creada_en: '2026-10-08T15:00:00Z', origen: 'nube' };

  test('una «nueva» de play/: se propone, no se desembolsa, y se ve para cuándo la pidió', () => {
    const P = abrirPanel();
    P.ev('_solicitudes = [' + JSON.stringify(pedidoPlay) + ']; renderBandeja();');
    const h = P.elems.bandeja.innerHTML;
    assert.match(h, /✏️ Proponer/);
    assert.ok(!/crearDesdeSolicitud\('31'\)/.test(h), 'deja crear el crédito sin que el cliente haya visto ni aceptado nada');
    assert.match(h, /Esperando TU propuesta/);
    assert.match(h, /Pidió desde la app/);
    assert.match(h, /para pagar el 20[^<]*2099 \(en \d+ días\)/);
    assert.ok(h.indexOf('<script>') < 0, 'el nombre del cliente entra sin escapar');
  });

  test('«Proponer» arranca con lo que pidió y lo dice con su fecha', () => {
    const P = abrirPanel();
    P.ev('_solicitudes = [' + JSON.stringify(Object.assign({}, pedidoPlay, { fecha_corte: '2099-01-20' })) + '];');
    P.ev('window.__modal = ""; openModal = function (t, h) { window.__modal = t + "|" + h; };');
    P.ev("editarContrapropuesta('31')");
    const m = P.ev('window.__modal');
    assert.match(m, /Pidió <b>\$700\.000<\/b> para pagar el 20[^<]*2099 \(en \d+ días\)/);
    assert.match(m, /pasa de 60 días/, 'no avisa que un pago único no llega a esa fecha');
    assert.match(m, /id="cpCap" type="number" inputmode="numeric"\s+value="700000"/, 'no arrancó con lo que pidió');
  });

  test('lo aceptado se ve en la fila, y su detalle se escapa entero', () => {
    const P = abrirPanel();
    const acept = Object.assign({}, pedidoPlay, { estado: 'aceptada', capital: 600000,
      contrapropuesta: { capital: 600000, costo: 120000, total: 720000, costo_pct: 20, dias: 15, fecha_pago: '2099-01-05', por: 'joan',
        condiciones: { version: '2026-10-08', aceptadas_en: '2026-10-08T20:30:00Z',
                       lineas: [{ clave: 'recibes', k: 'Recibes', v: '$600.000' }, { clave: 'x', k: '<img src=x onerror=1>', v: '<b>mal</b>' }] } } });
    P.ev('_solicitudes = [' + JSON.stringify(acept) + ']; renderBandeja();');
    const h = P.elems.bandeja.innerHTML;
    assert.match(h, /📄 Aceptó las condiciones/);
    assert.match(h, /verCondicionesAceptadas\('31'\)/);
    P.ev('window.__modal = ""; openModal = function (t, h) { window.__modal = t + "|" + h; };');
    P.ev("verCondicionesAceptadas('31')");
    const m = P.ev('window.__modal');
    assert.match(m, /<span class="k">Recibes<\/span><span class="vv">\$600\.000<\/span>/);
    assert.ok(m.indexOf('<img') < 0 && m.indexOf('<b>mal</b>') < 0, 'lo que viene del teléfono del cliente entra sin escapar');
  });
});
