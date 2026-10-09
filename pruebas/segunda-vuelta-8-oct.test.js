/* ============================================================================
 * LA SEGUNDA VUELTA DEL 8 DE OCTUBRE DE 2026
 *
 *   node --test pruebas/segunda-vuelta-8-oct.test.js
 *
 * La actualización del 8-oct (lo que Joan pidió registrándose él mismo) pasó
 * por tres revisiones: de ley, del teléfono y de seguridad. Esta batería amarra
 * lo que ellas encontraron y se arregló, cada cosa con la prueba que se caía
 * antes del arreglo. Lo que ya cuidaba otro archivo se cambió allá (con su
 * razón escrita): pedir-a-la-medida, respaldo-derecho, vitrina, panel,
 * platachat-bandeja, platachat-solicitud-pagina, responsable-nexeco,
 * la-mora-vieja-se-queda y condiciones-aceptadas-postgres.
 *
 * Por grupos:
 *   1. el teléfono: la calculadora, el registro y la cámara;
 *   2. el CRM: «Registrándose ahora», la ubicación por IP, el desembolso;
 *   3. la base: lo que dicen los archivos SQL nuevos;
 *   4. los textos: lo que se le promete al cliente y es verdad.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPlay } = require('./banco-play.js');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const U = require('../app/cuenta.js');
const C = require('../app/creditos.js');
const UbicacionIP = require('../app/ubicacion-ip.js');
const RV = require('../app/rostro-en-vivo.js');
const K = require('../app/cumplimiento.js');
const sinComentariosSQL = t => t.replace(/--[^\n]*/g, '');
const sinComentarios = t => String(t).replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const visible = html => sinComentarios(html).replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ticks = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
/* Cada prueba con su propia copia de la calculadora: guarda el dedo en el módulo. */
const calculadora = () => {
  delete require.cache[require.resolve('../app/calculadora-solicitud.js')];
  return require('../app/calculadora-solicitud.js');
};

/* ==========================================================================
 * 1. EL TELÉFONO
 * ======================================================================== */
describe('1. el teléfono: la calculadora, el registro y la cámara', () => {

  test('la cifra escrita: por debajo del mínimo no se mueve, al borrar vuelve la de antes, al salir se dice', () => {
    const CS = calculadora();
    CS.poner({ monto: 300000, dias: 30 });
    const el = { value: '' };
    const teclea = v => { el.value = v; CS.escribirMonto(el, { inputType: 'insertText' }); };
    teclea('1'); assert.equal(CS.estado().monto, 300000, 'una sola tecla movió la cifra al mínimo');
    teclea('15'); teclea('1.500'); teclea('15.000');
    assert.equal(CS.estado().monto, 300000, 'a medio escribir la cifra que manda saltó');
    teclea('150.000'); assert.equal(CS.estado().monto, 150000);
    assert.equal(el.value, '150.000');
    teclea(''); assert.equal(CS.estado().monto, 300000, 'al borrar la casilla no volvió la cifra de antes');
    teclea('15.000'); CS.terminarMonto(el);
    assert.equal(CS.estado().monto, CS.MONTO_MIN, 'al salir por debajo del mínimo no se puso el mínimo');
    assert.equal(el.value, CS.pesosEscritos(CS.MONTO_MIN), 'la casilla y la cifra que manda dicen cosas distintas');
  });

  test('pegar una cifra con centavos no la multiplica por cien (calculadora e ingresos)', () => {
    const CS = calculadora();
    CS.poner({ monto: 300000, dias: 30 });
    const el = { value: '$1.500.000,00' };
    CS.escribirMonto(el, { inputType: 'insertFromPaste' });
    assert.equal(CS.estado().monto, 1500000, 'pegar «$1.500.000,00» pidió ' + CS.estado().monto);
    /* Mientras TECLEA no: borrar el último cero de 1,500.000 deja 150.000. */
    assert.equal(CS.leerPesos('1,500.00', 'deleteContentBackward'), 150000);
    const P = abrirPlay();
    P.ev('pintarRegistro(6)');
    P.ev("var el = document.getElementById('f_ingreso_mes'); el.value = '$1.500.000,00'; anotarPesos(el, { inputType: 'insertFromPaste' });");
    assert.equal(P.ev('REGISTRO.ingreso_mes'), '1500000', 'el ingreso pegado con centavos quedó cien veces más grande');
    P.ev("var e2 = document.getElementById('f_ingreso_mes'); e2.value = '1,500.00'; anotarPesos(e2, { inputType: 'deleteContentBackward' });");
    assert.equal(P.ev('REGISTRO.ingreso_mes'), '150000');
  });

  test('el cursor no salta al final: un 2 en medio de 150.000 queda detrás del 2', () => {
    const CS = calculadora();
    let puesto = null;
    const el = { value: '1250.000', selectionStart: 2, setSelectionRange: (a) => { puesto = a; } };
    CS.escribirMonto(el, { inputType: 'insertText' });
    assert.equal(el.value, '1,250.000');
    assert.equal(puesto, 3, 'el cursor quedó en ' + puesto + ', no detrás del 2');
  });

  test('lo que se muestra va como en todo el sitio; lo que se teclea, como lo pidió Joan', () => {
    const CS = calculadora();
    assert.equal(CS.pesos(1500000), '$1.500.000');
    assert.equal(CS.pesosEscritos(1500000), '1,500.000');
    const h = CS.html({ monto: 1000000, dias: 30 }, { boton: 'Pedir {monto}', hoy: '2026-10-08' });
    assert.ok(!/\$1,000\.000/.test(h), 'un atajo o la cifra grande salió con la coma de los millones');
    assert.match(h, /placeholder="Por ejemplo 1,250\.000"/, 'la casilla perdió la forma de Joan');
  });

  test('el plazo llega a seis meses: lo más que el CRM sabe proponer', () => {
    const CS = calculadora();
    assert.equal(CS.DIAS_MAX, 180);
    assert.equal(CS.normalizar({ monto: 300000, dias: 365 }).dias, 180);
    assert.match(CS.html({ monto: 300000, dias: 30 }, { hoy: '2026-10-08' }), /id="csDias" min="1" max="180"/);
  });

  test('pedir no borra lo pedido, y mientras espera la calculadora dice lo que pidió', async () => {
    const P = abrirPlay();
    const sol = { id: 5, estado: 'nueva', contrapropuesta: null, pedido: { origen: 'play', capital: 750000, fecha_pago: '2026-11-20' } };
    P.ev('SESION = { access_token: "t", user: { email: "573001112233@tugarantia.net" } };' +
         'fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true, solicitud: ' + JSON.stringify(sol) + ' }); } }); };');
    P.ev('CS.poner({ monto: 750000, dias: 20 }); enviarPedido();');
    await ticks();
    const g = JSON.parse(P.almacen.tg_pedido_calc || 'null');
    assert.ok(g && g.monto === 750000, 'después de pedir, lo pedido se olvidó y la calculadora vuelve a 300.000');
    /* Otro teléfono, nada guardado: al ver la solicitud en espera, la calculadora se pone en lo pedido. */
    const Q = abrirPlay();
    Q.ev('ponerCalculadoraEnLoPedido(' + JSON.stringify(sol) + ')');
    assert.equal(Q.ev('CS.estado().monto'), 750000, 'la calculadora no arrancó en lo que está pedido');
    assert.equal(Q.ev('CS.diasHasta("2026-11-20", hoyISO())'), Q.ev('CS.estado().dias'));
  });

  test('la lámina de Crédito se repinta sin borrar la nota ni la cifra que estaba escribiendo', () => {
    const P = abrirPlay();
    P.ev("SESION = { access_token: 't', user: { email: '573001112233@tugarantia.net' } }; TAB = 'credito'; FICHA_ESTADO = 'nueva';");
    P.ev('pintarLamina()');
    assert.match(P.elems.lamina.innerHTML, /id="csNota"/, 'la lámina no trae la calculadora: la prueba no mide');
    P.elems.csNota.value = 'Surtir la tienda';
    P.elems.csMontoLibre.value = '750.000';
    /* Lo que hace un navegador de verdad: al pintar de nuevo, las casillas son
       OTRAS (vacías). El banco guarda los elementos por id; se olvidan. */
    let h = P.elems.lamina.innerHTML;
    Object.defineProperty(P.elems.lamina, 'innerHTML', {
      get: () => h, set: v => { h = v; delete P.elems.csNota; delete P.elems.csMontoLibre; }, configurable: true });
    P.ev('pintarLamina()');
    assert.equal(P.elems.csNota.value, 'Surtir la tienda', 'la nota se borró al llegar la ficha');
    assert.equal(P.elems.csMontoLibre.value, '750.000', 'la cifra que escribía se borró');
  });

  test('el celular del paso de contacto es el del paso 1: se ve, no se toca, y no se reescribe', () => {
    const P = abrirPlay();
    P.ev("REGISTRO.celular = '3001112233';");
    const h = P.ev('pasoCampos("contacto")');
    assert.match(h, /Tu celular \(con el que entras\)/);
    assert.match(h, /id="f_celular" type="tel"[^>]*readonly/, 'el celular con el que entra se puede cambiar sin decirlo');
    const i = P.ev('PASOS.findIndex(function (p) { return p.id === "contacto"; })');
    P.ev('PASO = ' + i + '; document.getElementById("f_celular").value = "300 111 2233"; recogerPaso();');
    assert.equal(P.ev('REGISTRO.celular'), '3001112233', 'el celular del registro quedó con espacios: así no entra');
  });

  test('las referencias dicen qué es «Qué es tuyo», y cada pesos con su ejemplo', () => {
    ['ref1_parentesco', 'ref2_parentesco'].forEach(id =>
      assert.match(U.CAMPOS.find(c => c.id === id).etiqueta, /mamá, amigo, compañero/));
    const P = abrirPlay();
    const h = P.ev('pasoCampos("ingresos")');
    assert.match(h, /id="f_ingreso_mes"[^>]*placeholder="Por ejemplo 1,500\.000"/);
    assert.match(h, /id="f_gastos_mes"[^>]*placeholder="Por ejemplo 600\.000"/, 'los gastos repiten el ejemplo del ingreso');
    assert.equal(U.revisarVinculacion({ gastos_mes: '0' }).errores.some(e => e.id === 'gastos_mes'), false,
      'quien no tiene gastos fijos no puede seguir');
    assert.equal(U.revisarVinculacion({ ingreso_mes: '0' }).errores.some(e => e.id === 'ingreso_mes'), true);
  });

  test('el correo: sin puntos de sobra, con su ejemplo y el autocompletado del teléfono', () => {
    ['juan@gmail.com.', 'juan..perez@gmail.com', 'juan.@gmail.com', 'juan@.gmail.com'].forEach(c =>
      assert.equal(U.correoValido(c), false, c + ' pasó como correo'));
    ['juan@gmail.com', 'juan.perez@gmail.com', 'ana_maria@correo.com.co'].forEach(c =>
      assert.equal(U.correoValido(c), true, c));
    const h = abrirPlay().ev('pasoCampos("contacto")');
    assert.match(h, /id="f_correo" type="email"[^>]*autocomplete="email"[^>]*placeholder="nombre@gmail\.com"/);
  });

  test('la selfie: el óvalo se centra en pantalla al encender la cámara, y la luz en la cara se dice bien', () => {
    const P = abrirPlay();
    P.ev('navigator.mediaDevices = { getUserMedia: function () { return new Promise(function () {}); } };' +
         'window.__sc = 0; document.getElementById("escaner").scrollIntoView = function () { window.__sc++; };');
    P.ev('iniciarEscaner()');
    assert.equal(P.ev('window.__sc'), 1, 'la guía y el botón quedan debajo del borde en un teléfono real');
    assert.match(RV.textoDeRostro({ falla: 'mucha_luz' }), /demasiada luz en tu cara/i);
    assert.ok(!/date la vuelta/i.test(RV.textoDeRostro({ falla: 'mucha_luz' })));
  });

  test('«no se pudo leer» se queda en pantalla lo bastante para leerlo', () => {
    assert.match(leer('play/index.html'), /\}, leyo \? 1500 : 4500\);/);
  });

  test('la tarjeta del crédito con garantía ya no compara con una tarjeta que no existe', () => {
    assert.ok(!/Compáralo con el de arriba antes de pedirlo/.test(leer('play/index.html')));
  });

  test('el aviso del cambio de responsable llega a play/: una vez, con «Entendido», y no a quien ya aceptó lo nuevo', () => {
    const P = abrirPlay();
    P.ev("SESION = { access_token: 't', user: { email: '573001112233@tugarantia.net', created_at: '2026-09-20T10:00:00Z' } };");
    const h = P.ev('avisoResponsablePlay()');
    assert.match(h, /NEXECO S\.A\.S\./); assert.match(h, /privacidad\.html#cambios/);
    assert.match(h, /onclick="cerrarAvisoResponsablePlay\(\)">Entendido</);
    P.ev('cerrarAvisoResponsablePlay()');
    assert.equal(P.almacen['tg_aviso_responsable_20261008_3001112233'], '1', 'la llave no es la de app/socio.html');
    assert.equal(P.ev('avisoResponsablePlay()'), '');
    const Q = abrirPlay();
    Q.ev("SESION = { access_token: 't', user: { email: '573001112233@tugarantia.net', created_at: '2026-10-09T10:00:00Z' } };");
    assert.equal(Q.ev('avisoResponsablePlay()'), '', 'le avisó un «cambio» a quien abrió su cuenta con la política nueva');
  });

  test('…y a PlataChat, arriba de todas las pestañas', () => {
    const pagina = leer('platachat/index.html');
    const vm = require('node:vm');
    const i = pagina.indexOf('var AVISO_RESPONSABLE_PC'), j = pagina.indexOf('/* ============================ PLATA');
    assert.ok(i > 0 && j > i, 'PlataChat no tiene el aviso del cambio de responsable');
    const almacen = {};
    const ctx = { SES: { celular: '3001112233' }, $: () => null,
      localStorage: { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); } } };
    vm.createContext(ctx); vm.runInContext(pagina.slice(i, j), ctx);
    assert.match(vm.runInContext('avisoResponsablePC()', ctx), /NEXECO S\.A\.S\./);
    vm.runInContext('cerrarAvisoResponsablePC()', ctx);
    assert.equal(almacen['tg_aviso_responsable_20261008_3001112233'], '1');
    assert.equal(vm.runInContext('avisoResponsablePC()', ctx), '');
    assert.match(pagina.slice(pagina.indexOf('function avisosArriba'), i), /avisoResponsablePC\(\)/, 'el aviso no se pinta arriba');
  });

  test('la versión de la política que aceptó viaja en los datos del registro', () => {
    const P = abrirPlay();
    const i = leer('play/index.html').indexOf('var cuerpoRegistro = {');
    assert.match(leer('play/index.html').slice(i, i + 600), /autorizacion_version: autorizacion\.version/);
    assert.equal(U.VERSION_AUTORIZACION, '2026-10-08');
    assert.ok(P);
  });
});

/* ==========================================================================
 * 2. EL CRM
 * ======================================================================== */
const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
  text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)),
  json: () => Promise.resolve(cuerpo) });
const GEO = {
  '181.1.1.1': { ip: '181.1.1.1', success: true, city: 'Bogotá', region: 'Distrito Capital de Bogotá',
                 country: 'Colombia', country_code: 'CO', connection: { isp: 'COMCEL S.A.' } },
  '186.2.2.2': { ip: '186.2.2.2', success: true, city: 'Soacha', region: 'Cundinamarca',
                 country: 'Colombia', country_code: 'CO', connection: { isp: 'Telmex' } }
};
function crm(responder) {
  const llamadas = [];
  const red = (url, cfg) => {
    let cuerpo = null; try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    llamadas.push({ url, cuerpo });
    if (url.startsWith('https://ipwho.is/')) {
      const ip = decodeURIComponent(url.slice('https://ipwho.is/'.length).split('?')[0]);
      return Promise.resolve(resp(200, GEO[ip] || { ip, success: false, message: 'Reserved range' }));
    }
    const fn = url.split('/rpc/')[1];
    const r = responder ? responder(fn, cuerpo) : null;
    if (r) return Promise.resolve(r);
    if (fn === 'archivos_de_registro') return Promise.resolve(resp(200, { fotos: {}, huella: null }));
    if (fn === 'cuentas_de_registros') return Promise.resolve(resp(200, []));
    return Promise.resolve(resp(200, null));
  };
  const P = abrirPanel({ red });
  P.ctx.UbicacionIP = UbicacionIP;
  P.ctx.CreditosPublicables = P.ctx.CreditosPublicables || Object.assign({}, C);
  P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"clave-de-prueba-larga"}))');
  P.llamadas = llamadas;
  P.geo = () => llamadas.filter(l => l.url.startsWith('https://ipwho.is/'));
  return P;
}
const registro = extra => Object.assign({ id: 9, nombre: 'Ana Prueba', cedula: '52000000', telefono: '3001234567',
  estado: 'nuevo', origen: 'abierto', creado_en: '2026-10-08T15:00:00Z',
  datos: { nombres: 'Ana', celular: '3001234567', autorizacion_version: '2026-10-08' },
  huella: { ip: '181.1.1.1', aparato: 'Mozilla/5.0 (Linux; Android 13)', momento: '2026-10-08T15:01:00Z' } }, extra || {});
const huecos = html => [...String(html).matchAll(/id="(ubicIP_\d+)"/g)].map(m => m[1]);
const texto = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('2. el CRM', () => {

  test('«Registrándose ahora»: en qué paso va cada uno, escapado, sin fotos, y con su WhatsApp', async () => {
    const P = crm(fn => fn === 'registro_vivo_joan' ? resp(200, { ok: true, gente: [{ celular: '3001112233',
      nombre: '<b>Ana</b>', paso: 3, de_pasos: 9, avance: { nombres: 'Ana', documento: '123', tipo_doc: 'Cédula de ciudadanía' },
      actualizado: '2026-10-08T15:00:00Z' }] }) : null);
    await P.ev('traerRegistroEnVivo()');
    await asentar(8);
    const h = P.elems.regEnVivo.innerHTML;
    assert.match(h, /Paso 3 de 9/);
    assert.ok(h.indexOf('<b>Ana</b>') < 0 && h.indexOf('&lt;b&gt;Ana&lt;/b&gt;') >= 0, 'el nombre que escribió el teléfono se pintó sin escapar');
    assert.match(h, /📲 Escribirle/);
    const l = P.llamadas.find(x => /registro_vivo_joan$/.test(x.url));
    assert.ok(l && l.cuerpo.p_clave, 'no se pidió con la clave del CRM');
    assert.match(leer('panel/crm.html'), /<div id="regEnVivo"><\/div>/, 'la sección no está en Registrados');
  });

  test('«Registrándose ahora» sin la migración: dice cuál pegar, no «no hay nadie»', async () => {
    const P = crm(fn => fn === 'registro_vivo_joan' ? resp(404, { message: 'Could not find the function' }) : null);
    await P.ev('traerRegistroEnVivo()');
    await asentar(8);
    assert.match(P.elems.regEnVivo.innerHTML, /20261008c_registro_vivo_joan\.sql/);
  });

  test('la IP de quien se registró con la política vieja NO sale a ipwho.is, y se dice', async () => {
    const P = crm();
    P.ctx.__regs = [registro({ datos: { nombres: 'Ana', celular: '3001234567' } })];
    P.ev('_registros=__regs; verDatosRegistro(9)');
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    await asentar(12);
    assert.equal(P.geo().length, 0, 'mandó a ipwho.is la IP de alguien que no lo autorizó');
    assert.match(texto(P.elems[id].innerHTML), /política de datos anterior al 8-oct-2026/);
    /* Con la autorización nueva, sí. */
    const Q = crm();
    Q.ctx.__regs = [registro()];
    Q.ev('_registros=__regs; verDatosRegistro(9)');
    await asentar(12);
    assert.equal(Q.geo().length, 1);
  });

  test('una cadena con varias IPs públicas se marca: la primera la puede poner el teléfono', async () => {
    const P = crm();
    P.ctx.__regs = [registro({ huella: { ip: '181.1.1.1, 186.2.2.2', aparato: '', momento: '2026-10-08T15:01:00Z' } })];
    P.ev('_registros=__regs; verDatosRegistro(9)');
    const [id] = huecos(P.ev('document.getElementById("mBody").innerHTML'));
    await asentar(12);
    assert.match(P.elems[id].innerHTML, /IP en cadena/);
    assert.match(texto(P.elems[id].innerHTML), /181\.1\.1\.1, 186\.2\.2\.2/);
    assert.equal(UbicacionIP.cadenaSospechosa('181.1.1.1, 10.0.0.1'), false, 'una IP privada detrás no es una cadena sospechosa');
  });

  test('la caché del navegador vence a los 90 días, y se olvida al borrar a la persona', async () => {
    const ahora = Date.parse('2026-10-08T12:00:00Z');
    const caja = {}, alm = { getItem: k => (k in caja ? caja[k] : null), setItem: (k, v) => { caja[k] = String(v); } };
    const u = UbicacionIP.ubicacionDe(GEO['181.1.1.1'], '181.1.1.1', '2026-06-01');
    caja[UbicacionIP.LLAVE] = JSON.stringify({ v: 1, ips: { '181.1.1.1': { u, t: ahora - 91 * 86400000 } } });
    let pedidas = 0;
    const Cn = UbicacionIP.crearConsultor({ almacen: alm, ahora: () => ahora,
      fetch: () => { pedidas++; return Promise.resolve(resp(200, GEO['181.1.1.1'])); } });
    const r = await Cn.consultar('181.1.1.1');
    assert.equal(r.de, 'red', 'usó una ubicación de hace más de 90 días');
    assert.equal(pedidas, 1);
    assert.equal(UbicacionIP.olvidarIP(alm, '181.1.1.1'), true);
    assert.ok(!/181\.1\.1\.1/.test(caja[UbicacionIP.LLAVE]), 'la IP de la persona borrada se quedó en el navegador');
    assert.match(leer('panel/crm.html'), /Tampoco se borra la constancia de las condiciones de credito/);
  });

  test('«📣 Aviso de datos» para los registrados con la política vieja, y no para los nuevos', () => {
    const P = crm();
    P.ctx.__regs = [registro({ id: 1, datos: { nombres: 'Vieja' } }), registro({ id: 2, telefono: '3007654321' })];
    P.ev('_registros=__regs; renderRegistros()');
    const h = P.elems.tblRegistros.innerHTML;
    assert.equal((h.match(/📣 Aviso de datos/g) || []).length, 1, 'el aviso no sale solo para quien aceptó la política vieja');
    assert.match(P.ev('mensajeAvisoResponsable({ nombre: "Ana Prueba" })'), /^Hola Ana 🙂.*NEXECO S\.A\.S\./);
  });

  test('desembolsar lo aceptado le pone al crédito el techo legal del recargo, y el CRM lo cobra así', () => {
    const P = crm();
    P.cargarCartera({ socios: [{ id: 's1', numero: 1, nombre: 'Ana Prueba', cedula: '52000000', telefono: '3005550000', gestiones: [] }], prestamos: [] });
    const s = { id: 77, origen: 'nube', cedula: '3005550000', nombre: 'Ana Prueba', capital: 600000, tasa: 0.2, costo: 120000, total: 720000,
      fecha_corte: '2026-11-07', producto: 'quincenal', estado: 'aceptada',
      contrapropuesta: { capital: 600000, costo_pct: 20, dias: 30, costo: 120000, total: 720000, fecha_pago: '2026-11-07', por: 'joan',
        condiciones: { version: '2026-10-08', aceptadas_en: '2026-10-08T15:00:00Z', tope_mora: { ea: 0.2859, por_dia: 408 },
          lineas: [{ clave: 'recibes', k: 'Recibes', v: '$600.000' }, { clave: 'total', k: 'Total a pagar', v: '$720.000' }],
          base: { capital: 600000, total: 720000, fecha_pago: '2026-11-07', creada_en: '' } } } };
    P.ev('_solicitudes=' + JSON.stringify([s]) + '; renderBandeja(); confirm = function (t) { return String(t).indexOf("bienvenida") < 0; }; crearDesdeSolicitud("77")');
    const p = JSON.parse(P.ev('JSON.stringify(DB.prestamos[0] || null)'));
    assert.ok(p, 'no se creó el crédito');
    assert.equal(p.topeMoraEA, C.topeDeReferencia('2026-10-08').tope, 'el crédito no lleva el techo del día en que aceptó');
    /* Diez días tarde: lo que cobra el CRM no pasa de lo que dicen sus condiciones (hasta $408 por día). */
    const mora = P.ev('liqCredito(DB.prestamos[0], "2026-11-17").recargo_mora');
    assert.ok(mora <= 408 * 10, 'el CRM cobra ' + mora + ' y las condiciones decían hasta 4.080');
    assert.match(P.ev('textoTasaMora(DB.prestamos[0], "2026-11-17")'), /techo legal aceptado/);
  });
});

/* ==========================================================================
 * 3. LA BASE
 * ======================================================================== */
describe('3. la base: lo que dicen los archivos nuevos', () => {

  test('aceptar compara también la fecha de pago y el sello de la propuesta', () => {
    const sql = sinComentariosSQL(leer('base/20261008_condiciones_aceptadas.sql'));
    const i = sql.indexOf('create or replace function public.aceptar_condiciones(');
    const cuerpo = sql.slice(i, sql.indexOf('$$;', i));
    assert.match(cuerpo, /p_vio ->> 'fecha_pago'/);
    assert.match(cuerpo, /p_vio ->> 'creada_en'/);
    assert.match(cuerpo, /'base', jsonb_build_object\('capital'/, 'el resumen no lleva las cifras de la base');
    assert.match(sql, /10 otra-fecha-no-acepta/); assert.match(sql, /11 otra-propuesta-no-acepta/);
    assert.match(leer('base/20261008b_condiciones_comprobar.sql'), /select 7, 'Aceptar compara también la fecha de pago/);
  });

  test('registro_vivo_joan: con la clave del CRM, sin fotos, solo lo que no venció, y cerrada a las sesiones', () => {
    const sql = sinComentariosSQL(leer('base/20261008c_registro_vivo_joan.sql'));
    const i = sql.indexOf('create or replace function public.registro_vivo_joan(p_clave text)');
    assert.ok(i >= 0);
    const cuerpo = sql.slice(i, sql.indexOf('$$;', i));
    assert.match(cuerpo, /security definer/); assert.match(cuerpo, /set search_path = public/);
    assert.match(cuerpo, /\bvolatile\b/);
    assert.match(cuerpo, /if not public\.clave_ok\(p_clave\)/);
    assert.match(cuerpo, /vence_en > now\(\)/);
    assert.ok(!/fotos/.test(cuerpo), 'devuelve las fotos');
    assert.match(cuerpo, /'nombres', 'apellidos', 'documento', 'tipo_doc',\s*'celular', 'correo', 'nacimiento'/);
    assert.match(sql, /revoke all on function public\.registro_vivo_joan\(text\) from public, anon, authenticated;/);
    assert.match(sql, /grant  execute on function public\.registro_vivo_joan\(text\) to anon;/);
    assert.ok(!/create table|alter table|drop /i.test(sql), 'la migración toca tablas: tenía que ser solo una función');
  });

  test('ninguna migración nueva reescribe una función que ya existía', () => {
    const viejas = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^2026(0[0-9]|10(0[0-7]))\d*.*\.sql$/.test(f) || /^20261007/.test(f))
      .map(f => leer('base/' + f)).join('\n');
    ['base/20261008_condiciones_aceptadas.sql', 'base/20261008c_registro_vivo_joan.sql'].forEach(f => {
      const nuevas = [...sinComentariosSQL(leer(f)).matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);
      nuevas.forEach(fn => assert.ok(viejas.indexOf('function public.' + fn + '(') < 0, f + ' reescribe ' + fn + ', que ya estaba aplicada'));
    });
  });
});

/* ==========================================================================
 * 4. LOS TEXTOS
 * ======================================================================== */
describe('4. los textos: lo que se promete es lo que pasa', () => {
  const TERM = leer('legal/terminos.html'), PRIV = leer('legal/privacidad.html');

  test('la portada no publica precio ni la modalidad quincenal', () => {
    const W = leer('index.html'), v = visible(W);
    assert.ok(!/quincen/i.test(v), 'la portada sigue hablando de quincenas: ' + (v.match(/.{40}quincen.{40}/i) || [])[0]);
    assert.ok(!/por cada \$\d/.test(v), 'la portada publica un precio «por cada»');
    assert.ok(!/más barato/i.test(v), 'la portada promete «más barato»');
    assert.ok(!/Los dos créditos/.test(v));
    [...W.matchAll(/<meta[^>]+content="([^"]+)"/g)].forEach(m =>
      assert.ok(!/quincena/i.test(m[1]), 'una descripción de la portada dice «quincena»: ' + m[1]));
    assert.ok(!/que ves en pesos en tu app/.test(v));
  });

  test('el recargo: los términos y las condiciones ya no se mandan el uno al otro', () => {
    const t = visible(TERM.match(/<section id="atraso">([\s\S]*?)<\/section>/)[1]);
    assert.match(t, /en pesos por día/);
    assert.match(t, /nunca pasa de la tasa de mora más alta que permite la ley/);
    assert.ok(!/lo ves en pesos en tu app/.test(t));
    assert.ok(!/como explican los términos/.test(leer('app/calculadora-solicitud.js').replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.match(visible(TERM), /Estos términos ya no fijan un precio ni un plazo igual para todos/);
  });

  test('los créditos de antes del 8-oct no cambian de manos en silencio', () => {
    assert.match(visible(TERM), /Los créditos que recibiste antes del 8 de octubre de 2026 no cambian/);
    assert.ok(!/Quien presta y responde es/.test(visible(TERM)));
  });

  test('la privacidad dice lo nuevo y no promete de más', () => {
    const v = visible(PRIV);
    assert.ok(!/Cada IP se consulta una sola vez/.test(v), 'promete una consulta por IP que depende de la base');
    assert.match(v, /se anota para no volver a consultar/);
    assert.match(v, /Tu avance mientras te registras/);
    assert.match(v, /se borra solo a las dos horas/i);
    assert.match(v, /si te asignamos uno, tu asesor/);
    assert.match(v, /quien se registró antes, no/);
    assert.ok(!/el contrato, los comprobantes/.test(v), 'el correo promete un contrato que nadie manda');
  });

  test('la casilla de autorización nombra a ipwho.is y que está fuera de Colombia', () => {
    const h = abrirPlay().ev('pasoPermiso()');
    assert.match(h, /ipwho\.is, un servicio fuera de Colombia que solo recibe la IP/);
  });

  test('la declaración de datos: la plantilla del rostro se genera en el computador de quien revisa', () => {
    const d = K.datosQueRecoge().find(x => x.id === 'foto_rostro');
    assert.match(d.nota, /en el computador de quien revisa/);
    assert.ok(!/No se genera ni se almacena ninguna plantilla biométrica/.test(d.nota), 'vuelve a negar la plantilla que sí se genera');
    assert.match(K.datosQueRecoge().find(x => x.id === 'datos_tecnicos').nota, /ipwho\.is/);
  });
});
