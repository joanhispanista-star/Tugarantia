'use strict';
/* ============================================================================
 * LA PESTAÑA DE SOLICITUDES — 13 de noviembre de 2026
 *
 *   node --test pruebas/la-pestana-de-solicitudes.test.js
 *
 * Joan: «el cliente no puso la cédula al momento de registrarse (…) y quiero
 * que desde el admin se vea cuando un cliente realiza una solicitud, y que
 * tenga una pestaña especial para eso».
 *
 * Lo que se prueba, con el CRM de verdad corriendo (banco-panel.js) y una nube
 * de mentira que anota cada llamada:
 *   1. «📨 Solicitudes» está arriba en el menú, con la MISMA bandeja que vivía
 *      en Socios (una sola #bandeja, un solo renderBandeja); los recados se
 *      quedan en Socios con su propio número.
 *   2. La bandeja sale agrupada por lo que Joan tiene que hacer, con los botones
 *      de siempre y un enlace a la ficha o al registro.
 *   3. «⚠️ Falta su cédula» con la regla de 📥 Registrados (la misma función) o
 *      con lo que sabe la ficha; y el registro que falta se pide UNA vez.
 *
 * Todos los nombres, celulares y cédulas son inventados.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
const CLAVE = 'clave-de-prueba-bien-larga';
const AHORA = '2026-11-13T10:00:00-05:00';
const sinEtiquetas = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* Una sección del HTML, de su <section> a su </section>. */
const seccion = id => {
  const m = new RegExp('<section class="view[^"]*" id="v-' + id + '">').exec(CRM);
  const i = m ? m.index : -1;
  assert.ok(i > 0, 'no existe la vista ' + id);
  return CRM.slice(i, CRM.indexOf('</section>', i));
};
const ENTRADAS = [...CRM.matchAll(/<button class="navbtn[^"]*" data-v="([a-z]+)">([\s\S]*?)<\/button>/g)]
  .map(m => ({ v: m[1], html: m[2] }));

const CP = (fecha, extra) => Object.assign({ por: 'joan', capital: 300000, total: 360000, costo_pct: 20, dias: 15,
  fecha_pago: fecha, creada_en: '2026-11-12T15:00:00Z' }, extra || {});
const sol = (id, extra) => Object.assign({ id, nombre: 'Cliente ' + id, cedula: '30000' + String(id).padStart(5, '0'),
  celular: '30000' + String(id).padStart(5, '0'), estado: 'nueva', app: 'tugarantia', capital: 250000, pedido_monto: 250000,
  producto: 'quincenal', registro_id: null, pedido: { origen: 'play', fecha_pago: '2026-11-28', dias: 15 },
  fecha_corte: '2026-11-28', creada_en: '2026-11-13T14:55:00Z' }, extra || {});

/* Registros inventados: lo que dijo su teléfono de las fotos (fotos_tomadas) y lo
   que dijo la base (huella), como los deja registrar_abierto. */
const reg = (id, fotos, extra) => Object.assign({ id, nombre: 'Registrado ' + id, cedula: '', telefono: '31100' + String(id).padStart(5, '0'),
  origen: 'abierto', estado: 'nuevo', creado_en: '2026-11-13T14:00:00Z', datos: { fotos_tomadas: fotos, nombres: 'Registrado' }, huella: {} }, extra || {});
const REG_SIN = reg(41, 'selfie');
const REG_CON = reg(42, 'cedula_frente,cedula_reverso,selfie', { huella: { momento: '2026-11-13T14:01:00Z' } });
const REG_UN_LADO = reg(43, 'cedula_reverso,selfie');
const REG_PLATACHAT = reg(44, 'selfie', { app: 'platachat' });
const REG_SIN_PERMISO = reg(45, 'sin_permiso');

const SOCIO = { id: 'C1', nombre: 'Socia Inventada', cedula: '1000000001', telefono: '3000000101', celular: '3000000101',
  vinculacion: { fotos_tomadas: 'selfie' } };
const SOCIO_A_MANO = { id: 'C2', nombre: 'Socio A Mano', cedula: '1000000002', telefono: '3000000102', celular: '3000000102' };

/* La nube: por función, una lista o un número (status de error). Anota cada llamada. */
function nube(o) {
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  const red = (url) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    vistas.push(fn);
    const r = o[fn];
    if (r !== undefined) {
      const v = typeof r === 'function' ? r() : r;
      return Promise.resolve(typeof v === 'number' ? resp(v, { message: 'algo falló' }) : resp(200, v));
    }
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { o, red, vistas, cuantas: fn => vistas.filter(x => x === fn).length };
}
function montar(o) {
  o = o || {};
  const N = nube(Object.assign({ listar_solicitudes_abiertas: [], listar_ayudas_clave: [] }, o.nube || {}));
  const P = abrirPanel({ red: N.red, ahora: AHORA, almacen: o.almacen });
  if (o.conNube !== false) P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  if (!o.almacen) P.cargarCartera({ socios: o.socios || [], prestamos: [], config: { negocio: 'Tu Garantía' }, equipo: [] });
  return { P, N };
}
const bandeja = P => P.elems.bandeja.innerHTML;
const pintar = (P, lista) => P.ev('_solicitudes = ' + JSON.stringify(lista.map(s => Object.assign({ origen: 'nube' }, s))) + '; renderBandeja()');
/* La fila de una solicitud, por su botón de descartar (todas lo traen). */
const filaDe = (P, id) => {
  const h = bandeja(P);
  const fin = h.indexOf("descartarSolicitud('" + id + "')");
  assert.ok(fin > 0, 'no salió la fila de ' + id);
  return h.slice(h.lastIndexOf('<tr>', fin), h.indexOf('</tr>', fin));
};

/* ======================================================================== */
describe('1. «📨 Solicitudes» tiene pestaña propia, arriba, con la misma bandeja', () => {

  test('es la segunda entrada del menú, con su número; Socios se queda con el de los recados', () => {
    assert.equal(ENTRADAS[0].v, 'dash');
    assert.equal(ENTRADAS[1].v, 'solicitudes', 'Solicitudes no está arriba en el menú: ' + ENTRADAS.map(e => e.v).join(','));
    assert.match(ENTRADAS[1].html, /📨<\/span> Solicitudes<span id="navSolicitudes"><\/span>/);
    const socios = ENTRADAS.find(e => e.v === 'socios');
    assert.match(socios.html, /<span id="navRecados"><\/span>/, 'Socios perdió el número de sus recados');
    assert.doesNotMatch(socios.html, /navSolicitudes/, 'el número de las solicitudes sigue en Socios');
  });

  test('la tarjeta, su #bandeja y sus dos botones viven en #v-solicitudes; los recados se quedan en Socios', () => {
    const s = seccion('solicitudes'), so = seccion('socios');
    assert.match(s, /<div id="bandeja"><\/div>/);
    assert.match(s, /onclick="traerSolicitudes\(\)">↻ Buscar en la nube/);
    assert.match(s, /onclick="pegarSolicitud\(\)">📋 Pegar el WhatsApp/);
    assert.doesNotMatch(so, /id="bandeja"/, 'la bandeja quedó también en Socios');
    assert.match(so, /<div id="ayudas"><\/div>/, '«🔑 Recados: no pueden entrar» se fue de Socios');
    assert.match(sinEtiquetas(so), /Las solicitudes ahora están en 📨 Solicitudes/);
    assert.match(so, /onclick="irA\('solicitudes'\)"/, 'la línea de Socios no lleva a ningún lado');
  });

  test('UNA sola bandeja: un #bandeja y un renderBandeja en todo el archivo', () => {
    assert.equal((CRM.match(/id="bandeja"/g) || []).length, 1);
    assert.equal((CRM.match(/function renderBandeja\(/g) || []).length, 1);
    assert.equal((CRM.match(/function traerSolicitudes\(/g) || []).length, 1);
  });

  test('abrir 📨 Solicitudes pregunta a la nube y pinta; con el freno de 15 s, volver no repite', async () => {
    const { P, N } = montar({ nube: { listar_solicitudes_abiertas: [sol(101)] } });
    P.ev("irA('solicitudes')");
    await asentar();
    assert.equal(N.cuantas('listar_solicitudes_abiertas'), 1, 'abrir la pestaña no le preguntó a la nube');
    assert.match(plano(bandeja(P)), /Cliente 101/);
    P.ev("irA('dash'); irA('solicitudes')");
    await asentar();
    assert.equal(N.cuantas('listar_solicitudes_abiertas'), 1, 'ir y venir en menos de 15 s volvió a llamar');
  });

  test('Socios sigue preguntando (sus recados viajan en esa vuelta), con el mismo freno', async () => {
    const { P, N } = montar({ nube: { listar_ayudas_clave: [{ id: 1, celular: '3001110000', nota: '', creada_en: '2026-11-13T14:00:00Z' }] } });
    P.ev("irA('socios')");
    await asentar();
    assert.equal(N.cuantas('listar_ayudas_clave'), 1, 'abrir Socios ya no trae los recados');
    assert.equal(P.elems.navRecados.textContent, ' (1)');
  });

  test('el número del menú cuenta lo que te toca (nuevas y aceptadas) y lo dice; los recados, en Socios', () => {
    const { P } = montar();
    P.ev('_solEstado = "ok"; _solicitudes = ' + JSON.stringify([sol(901), sol(902),
      sol(903, { estado: 'aceptada', contrapropuesta: CP('2026-11-28') }), sol(904, { estado: 'contrapropuesta', contrapropuesta: CP('2026-11-28') })]
      .map(s => Object.assign({ origen: 'nube' }, s))) + '; _ayudas = [{ id: 1 }]; _ayudasEstado = "ok"; pintarAvisos();');
    assert.equal(P.elems.navSolicitudes.textContent, ' (3)');
    assert.match(P.elems.navSolicitudes.title, /2 nueva\(s\) por proponer y 1 que aceptaron, por desembolsar/);
    assert.equal(P.elems.navRecados.textContent, ' (1)');
  });

  test('a 880 px o menos, tocar «📨 Solicitudes» lleva al contenido, como las demás entradas', () => {
    const { P } = montar();
    const mov = [];
    P.ctx.matchMedia = q => ({ matches: q === '(max-width:880px)' });
    P.ctx.scrollTo = (x, y) => { mov.push([x, y]); };
    P.ctx.pageYOffset = 100;
    P.ctx.document.querySelector = s => (s === '.main' ? { getBoundingClientRect: () => ({ top: 1301 }) } : null);
    const b = { dataset: { v: 'solicitudes' }, getAttribute: () => null };
    P.ctx.__toque = { target: { closest: s => (s === '.navbtn' ? b : null) } };
    P.ev('alTocarElMenu(__toque)');
    assert.deepEqual(mov, [[0, 1401]]);
  });
});

/* ======================================================================== */
describe('2. agrupada por lo que te toca hacer, con los botones de siempre', () => {
  const NUEVA = sol(201);
  const VENCIDA = sol(202, { estado: 'contrapropuesta', contrapropuesta: CP('2026-11-10') });
  const ACEPTADA = sol(203, { estado: 'aceptada', contrapropuesta: CP('2026-11-28') });
  const ESPERANDO = sol(204, { estado: 'contrapropuesta', contrapropuesta: CP('2026-11-28') });
  const PEGADA = { origen: 'pegada', id: 'peg-1', nombre: 'Pegada Inventada', codigo: '', cedula: '', capital: 200000,
    tasa: 0.2, costo: 40000, total: 240000, fecha_corte: null, producto: 'quincenal', creada_en: '2026-11-13' };
  const TITULOS = ['🙋 Nuevas: proponer', '⏰ Vencidas: cámbiales la propuesta', '✅ Aceptaron: desembolsar', '📨 Esperando que acepten', '📋 Pegadas del WhatsApp'];

  function todas() {
    const { P } = montar();
    /* La pegada entra como entra de verdad: sin origen 'nube'. */
    P.ev('_solicitudes = ' + JSON.stringify([ESPERANDO, ACEPTADA, NUEVA, VENCIDA].map(s => Object.assign({ origen: 'nube' }, s)).concat([PEGADA])) + '; renderBandeja()');
    return P;
  }

  test('los cinco grupos, en el orden en que se atienden, y cada fila debajo del suyo', () => {
    const P = todas(), h = bandeja(P);
    const pos = TITULOS.map(t => h.indexOf(t));
    pos.forEach((p, i) => assert.ok(p > 0, 'falta el grupo «' + TITULOS[i] + '»'));
    assert.deepEqual([...pos].sort((a, b) => a - b), pos, 'los grupos salieron en otro orden');
    const dondeVa = id => { const p = h.indexOf("descartarSolicitud('" + id + "')"); return pos.filter(x => x < p).length - 1; };
    assert.equal(dondeVa(201), 0, 'la nueva no quedó en «Nuevas: proponer»');
    assert.equal(dondeVa(202), 1, 'la vencida no quedó en «Vencidas»');
    assert.equal(dondeVa(203), 2, 'la aceptada no quedó en «Aceptaron: desembolsar»');
    assert.equal(dondeVa(204), 3, 'la que espera no quedó en «Esperando que acepten»');
    assert.equal(dondeVa('peg-1'), 4, 'la pegada no quedó en «Pegadas»');
    /* Cuántas en cada uno. */
    assert.match(sinEtiquetas(h), /🙋 Nuevas: proponer \(1\)/);
  });

  test('cada fila trae sus botones de siempre', () => {
    const P = todas();
    assert.match(filaDe(P, 201), /editarContrapropuesta\('201'\)">✏️ Proponer/);
    assert.match(filaDe(P, 203), /crearDesdeSolicitud\('203'\)">✓ Desembolsar/);
    assert.match(filaDe(P, 204), /editarContrapropuesta\('204'\)">✏️ Cambiar propuesta/);
    assert.match(plano(filaDe(P, 202)), /Vencida: pagaba el/, 'la vencida perdió la marca de la propuesta vencida');
    assert.match(filaDe(P, 'peg-1'), /crearDesdeSolicitud\('peg-1'\)">✓ Crear crédito/);
    [201, 202, 203, 204].forEach(id => assert.match(filaDe(P, id), new RegExp("verAparatosDeSolicitud\\('" + id + "'\\)")));
  });

  test('un grupo vacío no se pinta, y sin solicitudes la bandeja dice lo de siempre', async () => {
    const { P } = montar({ nube: { listar_solicitudes_abiertas: [NUEVA] } });
    P.ev('traerSolicitudes()');
    await asentar();
    const h = bandeja(P);
    assert.match(h, /🙋 Nuevas: proponer/);
    for (const t of TITULOS.slice(1)) assert.ok(!h.includes(t), 'se pintó el grupo vacío «' + t + '»');
    const { P: Q } = montar({ nube: { listar_solicitudes_abiertas: [] } });
    Q.ev('traerSolicitudes()');
    await asentar();
    assert.match(plano(bandeja(Q)), /Ninguna solicitud pendiente/);
  });

  test('cada fila enlaza a su ficha, o si no tiene, a su registro', () => {
    const { P } = montar({ socios: [SOCIO] });
    P.ev('_registros = ' + JSON.stringify([REG_CON]));
    pintar(P, [sol(301, { cedula: SOCIO.cedula, celular: SOCIO.celular, nombre: SOCIO.nombre }),
               sol(302, { registro_id: 42 }), sol(303)]);
    assert.match(filaDe(P, 301), /onclick="verCliente\('C1'\)"[^>]*>👤 Su ficha/);
    assert.match(filaDe(P, 302), /onclick="verDatosRegistro\('42'\)"[^>]*>📋 Su registro/);
    assert.doesNotMatch(filaDe(P, 303), /verCliente|verDatosRegistro/, 'sin ficha ni registro inventó un enlace');
    /* Y el enlace abre de verdad: el registro, desde los que trajo este computador. */
    P.ev("verDatosRegistro('42')");
    assert.match(P.elems.mTitle.textContent, /Registrado 42/);
  });

  test('aceptada en 📥 Registrados manda a desembolsar a 📨 Solicitudes, no a Socios', () => {
    const { P } = montar();
    P.ev('_solicitudes = ' + JSON.stringify([Object.assign({ origen: 'nube' }, sol(304, { registro_id: 41, estado: 'aceptada', contrapropuesta: CP('2026-11-28') }))]));
    const h = P.ev('pedidoEnRegistro(' + JSON.stringify(REG_SIN) + ')');
    assert.match(h, /onclick="irA\('solicitudes'\)">Desembolsar en 📨 Solicitudes/);
    assert.doesNotMatch(h, /irA\('socios'\)/);
  });
});

/* ======================================================================== */
describe('3. «⚠️ Falta su cédula», con lo que el CRM ya sabe', () => {

  test('del registro: la MISMA regla de 📥 Registrados, caso por caso', () => {
    const { P } = montar();
    const regs = [REG_SIN, REG_CON, REG_UN_LADO, REG_PLATACHAT, REG_SIN_PERMISO];
    P.ev('_registros = ' + JSON.stringify(regs));
    pintar(P, regs.map((r, i) => sol(400 + i, { registro_id: r.id })));
    regs.forEach((r, i) => {
      const enRegistrados = !!P.ev('chipCedulaRegistro(' + JSON.stringify(r) + ')');
      const enSolicitudes = /⚠️ Falta su cédula/.test(filaDe(P, 400 + i));
      assert.equal(enSolicitudes, enRegistrados, 'registro ' + r.id + ': Registrados dice ' + enRegistrados + ' y Solicitudes ' + enSolicitudes);
    });
    /* Y los casos que importan, uno por uno. */
    assert.match(plano(filaDe(P, 400)), /⚠️ Falta su cédula Se registró sin la cédula/);
    assert.match(filaDe(P, 400), /pedirFotosPorElChat\('41',''\)"[^>]*>💬 Pedirle las fotos por el chat/);
    assert.doesNotMatch(filaDe(P, 401), /Falta su cédula/, 'marcó a quien sí mandó las dos fotos');
    assert.match(plano(filaDe(P, 402)), /Se registró con un solo lado de la cédula/);
    assert.doesNotMatch(filaDe(P, 403), /Falta su cédula/, 'PlataChat se ve como en Registrados: sin la marca');
  });

  test('Registrados se pinta igual que antes: el chip sale de la misma regla', () => {
    const { P } = montar();
    const h = P.ev('chipCedulaRegistro(' + JSON.stringify(REG_SIN) + ')');
    assert.match(h, /<span class="chip riesgo-medio">🪪 Se registró sin la cédula<\/span>/);
    assert.match(h, /pedirFotosPorElChat\('41',''\)/);
    assert.equal(P.ev('chipCedulaRegistro(' + JSON.stringify(REG_CON) + ')'), '');
    assert.equal(P.ev('cedulaQueFaltaEnRegistro(' + JSON.stringify(REG_UN_LADO) + ')'), 'Se registró con un solo lado de la cédula');
  });

  test('de la ficha: si nació de un registro que lo anotó y no tiene la cédula; la hecha a mano, nada', () => {
    const { P } = montar({ socios: [SOCIO, SOCIO_A_MANO] });
    pintar(P, [sol(501, { cedula: SOCIO.cedula, celular: SOCIO.celular }), sol(502, { cedula: SOCIO_A_MANO.cedula, celular: SOCIO_A_MANO.celular })]);
    assert.match(filaDe(P, 501), /⚠️ Falta su cédula/);
    assert.match(filaDe(P, 501), /pedirFotosDeLaFicha\('C1','los_dos'\)/);
    assert.doesNotMatch(filaDe(P, 502), /Falta su cédula/, 'a una ficha hecha a mano no se le exigen fotos');
  });

  test('si este computador no tiene su registro, lo pide UNA vez, y con él sale la marca', async () => {
    const { P, N } = montar({ nube: { listar_solicitudes_abiertas: [sol(601, { registro_id: 41 }), sol(602)], listar_registros: [REG_SIN] } });
    P.ev("irA('solicitudes')");
    await asentar();
    assert.equal(N.cuantas('listar_registros'), 1, 'no pidió el registro de quien pidió sin ficha');
    assert.match(filaDe(P, 601), /⚠️ Falta su cédula/);
    assert.equal(P.ev('_registros.length'), 0, 'lo pedido para Solicitudes se metió en la bandeja de 📥 Registrados');
    /* La vuelta siguiente no lo vuelve a pedir: ni para la que ya tiene registro, ni
       para la que no tiene (602) — cada llamada es un intento del freno de clave_ok. */
    P.ev('traerSolicitudes(true)');
    await asentar();
    P.ev('traerSolicitudes(true)');
    await asentar();
    assert.equal(N.cuantas('listar_registros'), 1, 'cada vuelta del reloj vuelve a pedir los registros');
  });

  test('si pedirlo falla, no se inventa nada ni se insiste', async () => {
    const { P, N } = montar({ nube: { listar_solicitudes_abiertas: [sol(603, { registro_id: 41 })], listar_registros: 500 } });
    P.ev('traerSolicitudes()');
    await asentar();
    assert.doesNotMatch(filaDe(P, 603), /Falta su cédula/);
    P.ev('traerSolicitudes(true)');
    await asentar();
    assert.equal(N.cuantas('listar_registros'), 1);
  });

  test('en modo #equipo, ni marca, ni enlace, ni registros pedidos', () => {
    const { P } = montar({ socios: [SOCIO] });
    P.ev('_registros = ' + JSON.stringify([REG_SIN]));
    P.ev('CARTERA_EQUIPO = { yo: { celular: "3000000000" } }');
    const s = Object.assign({ origen: 'nube' }, sol(701, { registro_id: 41 }));
    assert.equal(P.ev('faltaCedulaDeSolicitud(' + JSON.stringify(s) + ')'), null);
    assert.equal(P.ev('enlaceDeSolicitud(' + JSON.stringify(s) + ')'), '');
    assert.equal(P.ev('traerRegistrosParaSolicitudes()'), false);
  });
});
