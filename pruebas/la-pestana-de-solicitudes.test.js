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
 *   4. Lo que llega y no has mirado se nota: aviso en el Tablero, número en la
 *      pestaña del navegador, recordado en ESTE navegador; sin sonido nuevo.
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
const LLAVE = 'tg_solicitudes_vistas';
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

/* La nube: por función, una lista o un número (status de error). Anota cada llamada.
   Una función recibe el cuerpo de la llamada y puede devolver una promesa (una nube
   que todavía no contesta). */
function nube(o) {
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(JSON.stringify(cuerpo)), json: () => Promise.resolve(cuerpo) });
  const como = v => typeof v === 'number' ? resp(v, { message: 'algo falló' }) : resp(200, v);
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    vistas.push(fn);
    const r = o[fn];
    if (r !== undefined) {
      let cuerpo = {};
      try { cuerpo = JSON.parse((cfg && cfg.body) || '{}'); } catch (e) { /* nada */ }
      const v = typeof r === 'function' ? r(cuerpo) : r;
      return v && typeof v.then === 'function' ? v.then(como) : Promise.resolve(como(v));
    }
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { o, red, vistas, cuantas: fn => vistas.filter(x => x === fn).length };
}
/* archivos_de_registro, como la de verdad: las fotos de ESE celular. */
const IMG = 'data:image/jpeg;base64,AAAA';
const SOLO_SELFIE = { fotos: { selfie: IMG }, huella: {} };
const LAS_DOS = { fotos: { cedula_frente: IMG, cedula_reverso: IMG, selfie: IMG }, huella: {} };
const fotosPorCelular = mapa => c => mapa[String(c.p_celular || '').replace(/\D/g, '').slice(-10)] || { fotos: {}, huella: null };
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
    /* Lo que dice el título de «Nuevas»: el botón para desembolsar sale cuando la
       acepten. Ni en la nueva ni en la que espera. */
    assert.match(bandeja(P), /El botón para desembolsar sale aquí cuando la acepten/);
    assert.doesNotMatch(filaDe(P, 201), /crearDesdeSolicitud/, 'una nueva, sin propuesta, se puede desembolsar');
    assert.doesNotMatch(filaDe(P, 204), /crearDesdeSolicitud/, 'una que no ha aceptado se puede desembolsar');
    assert.match(filaDe(P, 203), /crearDesdeSolicitud\('203'\)">✓ Desembolsar/);
    assert.match(filaDe(P, 204), /editarContrapropuesta\('204'\)">✏️ Cambiar propuesta/);
    assert.match(plano(filaDe(P, 202)), /Vencida: pagaba el/, 'la vencida perdió la marca de la propuesta vencida');
    assert.match(filaDe(P, 'peg-1'), /crearDesdeSolicitud\('peg-1'\)">✓ Crear crédito/);
    [201, 202, 203, 204].forEach(id => assert.match(filaDe(P, id), new RegExp("verAparatosDeSolicitud\\('" + id + "'\\)")));
  });

  /* 13-nov-2026 (remate) — la revisión: el número contaba las nuevas y las aceptadas,
     y no las «⏰ Vencidas» que siguen en 'contrapropuesta', que también le tocan. */
  test('el número del menú cuenta lo que te toca: nuevas, aceptadas y vencidas; no las que solo esperan', async () => {
    const VENCIDA_ACEPTADA = sol(205, { estado: 'aceptada', contrapropuesta: CP('2026-11-10') });
    const { P } = montar({ nube: { listar_solicitudes_abiertas: [NUEVA, VENCIDA, ACEPTADA, ESPERANDO, VENCIDA_ACEPTADA] } });
    P.ev('traerSolicitudes()');
    await asentar();
    /* 201 nueva + 203 y 205 aceptadas + 202 vencida sin aceptar; 204 solo espera. */
    assert.equal(P.elems.navSolicitudes.textContent, ' (4)', 'la vencida que sigue en contrapropuesta no cuenta');
    assert.match(P.elems.navSolicitudes.title, /1 nueva\(s\) por proponer y 2 que aceptaron, por desembolsar; y 1 con la propuesta vencida, por cambiar/);
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
describe('3. «⚠️ Falta su cédula», con lo que el CRM ya sabe y lo que dice la nube', () => {

  /* 13-nov-2026 (remate) — la sospecha sale de la regla de 📥 Registrados; el «⚠️
     Falta su cédula» solo después de preguntarle a la nube. Aquí la nube no tiene
     la cédula de nadie (solo la selfie). */
  test('del registro: la MISMA regla de 📥 Registrados, caso por caso, con la nube confirmándolo', async () => {
    const { P } = montar({ nube: { archivos_de_registro: SOLO_SELFIE } });
    const regs = [REG_SIN, REG_CON, REG_UN_LADO, REG_PLATACHAT, REG_SIN_PERMISO];
    P.ev('_registros = ' + JSON.stringify(regs));
    pintar(P, regs.map((r, i) => sol(400 + i, { registro_id: r.id })));
    await asentar();
    regs.forEach((r, i) => {
      const enRegistrados = !!P.ev('chipCedulaRegistro(' + JSON.stringify(r) + ')');
      const enSolicitudes = /⚠️ Falta su cédula/.test(filaDe(P, 400 + i));
      assert.equal(enSolicitudes, enRegistrados, 'registro ' + r.id + ': Registrados dice ' + enRegistrados + ' y Solicitudes ' + enSolicitudes);
    });
    /* Y los casos que importan, uno por uno. */
    assert.match(plano(filaDe(P, 400)), /⚠️ Falta su cédula Se registró sin la cédula\. Le pregunté a la nube a las \d{2}:\d{2}: no tiene ningún lado de su cédula\./);
    assert.match(filaDe(P, 400), /pedirFotosPorElChat\('41',''\)"[^>]*>💬 Pedirle las fotos por el chat/);
    assert.doesNotMatch(filaDe(P, 401), /Falta su cédula|🪪/, 'marcó a quien sí mandó las dos fotos');
    assert.match(plano(filaDe(P, 402)), /Se registró con un solo lado de la cédula/);
    assert.doesNotMatch(filaDe(P, 403), /Falta su cédula|🪪/, 'PlataChat se ve como en Registrados: sin la marca');
  });

  test('Registrados se pinta igual que antes: el chip sale de la misma regla', () => {
    const { P } = montar();
    const h = P.ev('chipCedulaRegistro(' + JSON.stringify(REG_SIN) + ')');
    assert.match(h, /<span class="chip riesgo-medio">🪪 Se registró sin la cédula<\/span>/);
    assert.match(h, /pedirFotosPorElChat\('41',''\)/);
    assert.equal(P.ev('chipCedulaRegistro(' + JSON.stringify(REG_CON) + ')'), '');
    assert.equal(P.ev('cedulaQueFaltaEnRegistro(' + JSON.stringify(REG_UN_LADO) + ')'), 'Se registró con un solo lado de la cédula');
  });

  test('de la ficha: si nació de un registro que lo anotó y no tiene la cédula; la hecha a mano, nada', async () => {
    const { P, N } = montar({ socios: [SOCIO, SOCIO_A_MANO], nube: { archivos_de_registro: SOLO_SELFIE } });
    pintar(P, [sol(501, { cedula: SOCIO.cedula, celular: SOCIO.celular }), sol(502, { cedula: SOCIO_A_MANO.cedula, celular: SOCIO_A_MANO.celular })]);
    await asentar();
    assert.match(plano(filaDe(P, 501)), /⚠️ Falta su cédula Se registró sin la cédula\. Le pregunté a la nube/);
    /* El botón de la fila no lleva el lado escrito: pregunta antes (ver la sección 3b). */
    assert.match(filaDe(P, 501), /pedirFotosDeLaFicha\('C1',''\)/);
    assert.doesNotMatch(filaDe(P, 501), /antes de desembolsar/, 'junto a «Desembolsar», la frase se lee como un requisito');
    assert.doesNotMatch(filaDe(P, 502), /Falta su cédula|🪪/, 'a una ficha hecha a mano no se le exigen fotos');
    assert.equal(N.cuantas('archivos_de_registro'), 1, 'a la ficha hecha a mano no hay por qué preguntarle nada a la nube');
  });

  test('si este computador no tiene su registro, lo pide UNA vez, y con él sale la marca', async () => {
    const { P, N } = montar({ nube: { listar_solicitudes_abiertas: [sol(601, { registro_id: 41 }), sol(602)], listar_registros: [REG_SIN],
      archivos_de_registro: SOLO_SELFIE } });
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

/* ========================================================================
 * 3b. LA CÉDULA QUE SUBIÓ DESPUÉS — 13-nov-2026 (remate)
 *
 * El caso exacto que pidió Joan, y el que encontró la revisión: se registró
 * solo con la selfie, después vio «Subir mi cédula» (v144), la subió y pidió.
 * fotos_tomadas y los campos de la ficha siguen diciendo lo del primer día;
 * la nube ya tiene las dos caras. Joan no puede leer «⚠️ Falta su cédula», ni
 * en la fila ni en el 🔔 del Tablero, y «💬 Pedirle las fotos» no le puede
 * pedir lo que ya mandó.
 * ======================================================================== */
describe('3b. la cédula que subió después no se le vuelve a pedir', () => {
  /* Subió la cédula 4 días después del registro: registro_archivos_guardar
     escribió huella.momento, y fotos_tomadas sigue en 'selfie'. */
  const TARDIO = reg(51, 'selfie', { creado_en: '2026-11-08T14:00:00Z', huella: { momento: '2026-11-12T16:00:00Z' } });
  const CEL_TARDIO = TARDIO.telefono;
  const SOL_TARDIA = sol(951, { nombre: 'Tardio Inventado', registro_id: 51, cedula: CEL_TARDIO, celular: CEL_TARDIO });

  async function llegaLaDelTardio(fotos) {
    let lista = [];
    const M = montar({ nube: { listar_solicitudes_abiertas: () => lista, listar_registros: [TARDIO], archivos_de_registro: fotos } });
    M.P.ev('traerSolicitudes(true)');
    await asentar();
    lista = [SOL_TARDIA];
    M.P.ev('traerSolicitudes(true)');
    await asentar();
    return M;
  }

  test('sin ficha: la nube tiene las dos caras, y ni la fila ni el Tablero dicen que falta', async () => {
    const { P, N } = await llegaLaDelTardio(fotosPorCelular({ [CEL_TARDIO]: LAS_DOS }));
    const t = sinEtiquetas(P.elems.avisoSolicitudesNuevas.innerHTML);
    assert.match(t, /^🔔 Tardio Inventado pidió \$250\.000/);
    assert.doesNotMatch(t, /falta su cédula/i, 'el Tablero le dice a Joan que falta lo que ya subió');
    assert.doesNotMatch(filaDe(P, 951), /Falta su cédula|Se registró sin la cédula|Pedirle las fotos/, 'la fila pide lo que ya subió');
    assert.equal(N.cuantas('archivos_de_registro'), 1);
  });

  test('con ficha: tampoco, aunque los campos de la ficha no la tengan', async () => {
    const FICHA = Object.assign({}, SOCIO, { selfieFoto: 'foto:reg:' + SOCIO.telefono + '/selfie', cedulaFrenteFoto: null, cedulaReversoFoto: null });
    const { P, N } = montar({ socios: [FICHA], nube: { archivos_de_registro: fotosPorCelular({ [SOCIO.telefono]: LAS_DOS }) } });
    pintar(P, [sol(952, { cedula: SOCIO.cedula, celular: SOCIO.celular })]);
    await asentar();
    assert.doesNotMatch(filaDe(P, 952), /Falta su cédula|🪪|Pedirle las fotos/);
    assert.equal(N.cuantas('archivos_de_registro'), 1);
    /* La ficha no se tocó: eso lo hace traerFotosTardias al abrirla, con su guardar(). */
    assert.equal(P.ev("DB.socios[0].cedulaFrenteFoto"), null);
  });

  test('mientras la nube no contesta: lo del registro como hecho del registro, y el Tablero no lo dice', async () => {
    let soltar;
    const colgada = new Promise(r => { soltar = r; });
    const M = await llegaLaDelTardio(() => colgada.then(() => SOLO_SELFIE));
    const f = plano(filaDe(M.P, 951));
    assert.match(f, /🪪 Se registró sin la cédula Le estoy preguntando a la nube si la subió después…/);
    assert.doesNotMatch(f, /⚠️ Falta su cédula/, 'afirmó en presente lo que solo se sabe del día del registro');
    assert.doesNotMatch(sinEtiquetas(M.P.elems.avisoSolicitudesNuevas.innerHTML), /falta su cédula/i);
    /* Contesta que no la tiene: ahora sí, en la fila y en el Tablero. */
    soltar();
    await asentar();
    assert.match(plano(filaDe(M.P, 951)), /⚠️ Falta su cédula Se registró sin la cédula\. Le pregunté a la nube a las \d{2}:\d{2}: no tiene ningún lado de su cédula\./);
    assert.match(sinEtiquetas(M.P.elems.avisoSolicitudesNuevas.innerHTML), /Tardio Inventado pidió \$250\.000, hace 5 min · ⚠️ falta su cédula/);
    assert.equal(M.N.cuantas('archivos_de_registro'), 1, 'preguntó dos veces por la misma persona');
  });

  test('si la nube falla: el hecho del registro y «no pude preguntar», sin ⚠️, sin aviso, y no insiste en cada vuelta', async () => {
    const M = await llegaLaDelTardio(500);
    const f = plano(filaDe(M.P, 951));
    assert.match(f, /🪪 Se registró sin la cédula No pude preguntarle a la nube si la subió después: .+\. Eso no quiere decir que le falte\./);
    assert.doesNotMatch(f, /⚠️ Falta su cédula/);
    assert.doesNotMatch(sinEtiquetas(M.P.elems.avisoSolicitudesNuevas.innerHTML), /falta su cédula/i);
    M.P.ev('traerSolicitudes(true)'); await asentar();
    M.P.ev('traerSolicitudes(true)'); await asentar();
    assert.equal(M.N.cuantas('archivos_de_registro'), 1, 'cada vuelta del reloj vuelve a preguntar (cada llamada pasa por clave_ok)');
  });

  test('con algo de menos vuelve a preguntar a los 10 minutos; con las dos caras, nunca', async () => {
    let fotos = SOLO_SELFIE;
    const M = await llegaLaDelTardio(() => fotos);
    assert.match(filaDe(M.P, 951), /⚠️ Falta su cédula/);
    fotos = LAS_DOS;
    M.P.ev('traerSolicitudes(true)'); await asentar();
    assert.equal(M.N.cuantas('archivos_de_registro'), 1, 'antes de los 10 minutos no se vuelve a preguntar');
    /* Pasan 10 minutos (se envejece la respuesta: el reloj del banco está quieto). */
    M.P.ev("_cedulaEnLaNube['" + CEL_TARDIO + "'].en -= 10*60e3 + 1");
    M.P.ev('renderBandeja()'); await asentar();
    assert.equal(M.N.cuantas('archivos_de_registro'), 2);
    assert.doesNotMatch(filaDe(M.P, 951), /Falta su cédula|🪪/, 'la subió, y la fila lo sigue pidiendo');
    M.P.ev("_cedulaEnLaNube['" + CEL_TARDIO + "'].en -= 60*60e3");
    M.P.ev('renderBandeja()'); await asentar();
    assert.equal(M.N.cuantas('archivos_de_registro'), 2, 'con las dos caras no hay nada que volver a preguntar');
  });

  test('«💬 Pedirle las fotos» de una ficha pregunta antes: si ya llegaron no abre el chat; si falta, pide lo que falta', async () => {
    const correr = async (fotos) => {
      const { P } = montar({ socios: [SOCIO], nube: { archivos_de_registro: fotos } });
      P.ev('__abiertos = []; escribirlePorLaApp = function (d, i, b) { __abiertos.push([d, i, b]); }');
      P.ev("pedirFotosDeLaFicha('C1','')");
      await asentar();
      return { abiertos: JSON.parse(P.ev('JSON.stringify(__abiertos)')), avisos: P.ctx._avisos || [] };
    };
    let r = await correr(fotosPorCelular({ [SOCIO.telefono]: LAS_DOS }));
    assert.equal(r.abiertos.length, 0, 'le abrió el chat para pedirle lo que ya mandó');
    assert.match(r.avisos.join('\n'), /Ya llegaron las dos fotos de su cédula/);
    r = await correr(fotosPorCelular({ [SOCIO.telefono]: { fotos: { cedula_reverso: IMG, selfie: IMG }, huella: {} } }));
    assert.equal(r.abiertos.length, 1);
    assert.deepEqual(r.abiertos[0].slice(0, 2), ['ficha', 'C1']);
    assert.match(r.abiertos[0][2], /nos falta la foto del frente de tu cédula/);
    r = await correr(500);
    assert.equal(r.abiertos.length, 0, 'con la nube fallando abrió el chat a ciegas');
    assert.match(r.avisos.join('\n'), /No te abro el chat a ciegas/);
    /* Con el lado escrito (el botón de la ficha abierta, que ya trajo sus fotos), como siempre. */
    const { P } = montar({ socios: [SOCIO] });
    P.ev('__abiertos = []; escribirlePorLaApp = function (d, i, b) { __abiertos.push([d, i, b]); }');
    P.ev("pedirFotosDeLaFicha('C1','los_dos')");
    assert.match(P.ev('__abiertos[0][2]'), /por los dos lados/);
  });

  test('lo que contesta el botón de 📥 Registrados también le sirve a la fila', async () => {
    const M = await llegaLaDelTardio(() => SOLO_SELFIE);
    assert.match(filaDe(M.P, 951), /⚠️ Falta su cédula/);
    /* La sube mientras tanto; Joan toca «Pedirle las fotos» y la nube ya la tiene. */
    M.N.o.archivos_de_registro = LAS_DOS;
    M.P.ev('escribirlePorLaApp = function () {}');
    M.P.ev("pedirFotosPorElChat('51','')");
    await asentar();
    assert.match((M.P.ctx._avisos || []).join('\n'), /Ya llegaron las dos fotos de su cédula/);
    assert.doesNotMatch(filaDe(M.P, 951), /Falta su cédula|🪪/, 'Joan ya supo que llegó, y la fila sigue diciendo que falta');
  });
});

/* ======================================================================== */
describe('4. que Joan se entere cuando alguien pide', () => {
  const PRIMERA = sol(801, { nombre: 'Primera Inventada' });
  const ANA = sol(802, { nombre: 'Ana Inventada', capital: 250000, pedido_monto: 250000, creada_en: '2026-11-13T14:55:00Z' });

  async function conUnaVieja(o) {
    let lista = [PRIMERA];
    o = o || {};
    const M = montar(Object.assign({}, o, { nube: Object.assign({ listar_solicitudes_abiertas: () => lista }, o.nube || {}) }));
    M.P.ev('traerSolicitudes(true)');
    await asentar();
    M.llega = async (...nuevas) => { lista = lista.concat(nuevas); M.P.ev('traerSolicitudes(true)'); await asentar(); };
    return M;
  }

  test('la primera vez que este navegador pregunta, lo que ya estaba no se anuncia: se anota', async () => {
    const { P } = await conUnaVieja();
    assert.equal(P.elems.avisoSolicitudesNuevas.innerHTML, '', 'anunció como nueva una solicitud que ya estaba');
    assert.deepEqual(JSON.parse(P.almacen[LLAVE]), ['801']);
    assert.equal(P.ctx.document.title, 'Tu Garantía · Panel');
  });

  test('llega una: «🔔 Ana pidió $250.000, hace 5 min · Ver» en el Tablero, y «(1)» en la pestaña del navegador', async () => {
    const M = await conUnaVieja();
    await M.llega(ANA);
    const P = M.P, h = P.elems.avisoSolicitudesNuevas.innerHTML;
    assert.equal(sinEtiquetas(h), '🔔 Ana Inventada pidió $250.000, hace 5 min · Ver');
    assert.match(h, /onclick="irA\('solicitudes'\)">Ver<\/button>/);
    assert.equal(P.ctx.document.title, '(1) Tu Garantía · Panel');
    assert.equal(P.elems.navSolicitudes.textContent, ' (2)');
    /* El aviso vive en el Tablero, no en el menú: a 880 px se ve igual. */
    assert.match(seccion('dash'), /<div id="avisoSolicitudesNuevas"><\/div>/);
  });

  test('abrir 📨 Solicitudes es mirarlas: el aviso y el número del navegador se van, y se recuerda al recargar', async () => {
    const M = await conUnaVieja();
    await M.llega(ANA);
    M.P.ev("irA('solicitudes')");
    assert.equal(M.P.elems.avisoSolicitudesNuevas.innerHTML, '');
    assert.equal(M.P.ctx.document.title, 'Tu Garantía · Panel');
    assert.deepEqual(JSON.parse(M.P.almacen[LLAVE]).sort(), ['801', '802']);
    /* F5 en el mismo navegador. */
    const N2 = nube({ listar_solicitudes_abiertas: [PRIMERA, ANA], listar_ayudas_clave: [] });
    const Q = abrirPanel({ red: N2.red, ahora: AHORA, almacen: M.P.almacen });
    Q.ev('traerSolicitudes(true)');
    await asentar();
    assert.equal(Q.elems.avisoSolicitudesNuevas.innerHTML, '', 'al recargar volvió a anunciar lo que ya miró');
  });

  test('abrir la pestaña antes de que la nube conteste no borra lo que este navegador recordaba', async () => {
    /* Un F5 con la lista ya anotada, y Joan entra a 📨 Solicitudes de una: la
       nube todavía no contesta. Si «mirar» guardara la lista vacía de ese
       momento, lo que ya había mirado volvería a salir como nuevo. */
    let soltar;
    const colgada = new Promise(r => { soltar = r; });
    const resp = c => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(c)) });
    const red = url => {
      const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
      if (fn === 'listar_solicitudes_abiertas') return colgada.then(() => resp([PRIMERA, ANA, sol(831, { nombre: 'Recien Inventada' })]));
      if (fn === 'listar_ayudas_clave') return Promise.resolve(resp([]));
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('{}') });
    };
    const almacen = { [LLAVE]: JSON.stringify(['801', '802']),
      joan_socios_sb: JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE }) };
    const P = abrirPanel({ red, ahora: AHORA, almacen });
    P.ev("irA('solicitudes')");
    await asentar();
    assert.deepEqual(JSON.parse(P.almacen[LLAVE]), ['801', '802'], 'abrir la pestaña sin respuesta borró lo recordado');
    /* Joan se va al Tablero antes de que conteste; cuando contesta, solo la recién llegada es nueva. */
    P.ev("irA('dash')");
    soltar();
    await asentar();
    const t = sinEtiquetas(P.elems.avisoSolicitudesNuevas.innerHTML);
    assert.match(t, /^🔔 Recien Inventada pidió/);
    assert.doesNotMatch(t, /Ana Inventada|Primera Inventada/);
  });

  test('con 📨 Solicitudes a la vista, lo que llega ya se está mirando; con el navegador escondido, no', async () => {
    const M = await conUnaVieja();
    M.P.ev("irA('solicitudes')");
    await M.llega(ANA);
    assert.equal(M.P.elems.avisoSolicitudesNuevas.innerHTML, '');
    M.P.ctx.document.hidden = true;
    await M.llega(sol(803, { nombre: 'Escondida Inventada' }));
    assert.match(sinEtiquetas(M.P.elems.avisoSolicitudesNuevas.innerHTML), /Escondida Inventada pidió/);
  });

  test('varias: el número, las tres más recientes y «y N más»; las pegadas nunca', async () => {
    const M = await conUnaVieja();
    await M.llega(sol(811, { nombre: 'Uno', creada_en: '2026-11-13T14:10:00Z' }), sol(812, { nombre: 'Dos', creada_en: '2026-11-13T14:20:00Z' }),
      sol(813, { nombre: 'Tres', creada_en: '2026-11-13T14:30:00Z' }), sol(814, { nombre: 'Cuatro', creada_en: '2026-11-13T14:40:00Z' }));
    M.P.ev('_solicitudes.push({ origen: "pegada", id: "peg-9", nombre: "Pegada", capital: 1 }); pintarAvisos();');
    const t = sinEtiquetas(M.P.elems.avisoSolicitudesNuevas.innerHTML);
    assert.match(t, /^🔔 4 solicitudes nuevas · Ver/);
    assert.ok(t.indexOf('Cuatro pidió') < t.indexOf('Tres pidió') && t.indexOf('Tres pidió') < t.indexOf('Dos pidió'), 'no van de la más reciente a la más vieja: ' + t);
    assert.doesNotMatch(t, /Uno pidió/);
    assert.match(t, /y 1 más$/);
    assert.doesNotMatch(t, /Pegada/);
    assert.equal(M.P.ctx.document.title, '(4) Tu Garantía · Panel');
  });

  test('si le falta la cédula, el aviso lo dice (cuando la nube lo confirma)', async () => {
    const M = await conUnaVieja({ nube: { archivos_de_registro: SOLO_SELFIE } });
    M.P.ev('_registros = ' + JSON.stringify([REG_SIN]));
    await M.llega(sol(821, { nombre: 'Sin Cedula Inventada', registro_id: 41 }));
    assert.match(sinEtiquetas(M.P.elems.avisoSolicitudesNuevas.innerHTML), /Sin Cedula Inventada pidió \$250\.000, hace 5 min · ⚠️ falta su cédula/);
  });

  test('si el navegador no deja guardar, avisa igual en esta sesión y no se cae', async () => {
    let lista = [PRIMERA];
    const N = nube({ listar_solicitudes_abiertas: () => lista, listar_ayudas_clave: [] });
    const P = abrirPanel({ red: N.red, ahora: AHORA });
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
    P.cargarCartera({ socios: [], prestamos: [], config: {}, equipo: [] });
    const ls = P.ctx.localStorage, get = ls.getItem, set = ls.setItem;
    ls.getItem = k => { if (k === LLAVE) throw new Error('bloqueado'); return get(k); };
    ls.setItem = (k, v) => { if (k === LLAVE) throw new Error('bloqueado'); return set(k, v); };
    P.ev('traerSolicitudes(true)');
    await asentar();
    assert.equal(P.elems.avisoSolicitudesNuevas.innerHTML, '');
    lista = lista.concat([ANA]);
    P.ev('traerSolicitudes(true)');
    await asentar();
    assert.match(sinEtiquetas(P.elems.avisoSolicitudesNuevas.innerHTML), /Ana Inventada pidió/);
  });

  /* 13-nov-2026 (remate) — la revisión: con dos pestañas del CRM abiertas, la que no
     se miró seguía con el aviso y el «(n)» hasta un F5 (_solVistas se lee una vez). */
  test('con dos pestañas del CRM, lo que miró la otra se le quita a esta, sin olvidar lo que esta ya miró', async () => {
    const M = await conUnaVieja();
    await M.llega(ANA);
    assert.match(sinEtiquetas(M.P.elems.avisoSolicitudesNuevas.innerHTML), /Ana Inventada pidió/);
    assert.equal(M.P.ctx.document.title, '(1) Tu Garantía · Panel');
    /* El oyente es el de la cartera, que se pone después del PIN (window, 'storage'). */
    assert.match(CRM, /window\.addEventListener\('storage', alEscribirOtraPagina\)/);
    /* La otra pestaña abrió 📨 Solicitudes: guardó solo las que tiene abiertas (la 801 ya se cerró allá). */
    M.P.almacen[LLAVE] = JSON.stringify(['802']);
    M.P.ev("alEscribirOtraPagina({ key: '" + LLAVE + "' })");
    assert.equal(M.P.elems.avisoSolicitudesNuevas.innerHTML, '', 'la otra pestaña ya la miró, y esta la sigue anunciando');
    assert.equal(M.P.ctx.document.title, 'Tu Garantía · Panel');
    assert.deepEqual(JSON.parse(M.P.ev('JSON.stringify(_solVistas)')).sort(), ['801', '802'], 'olvidó lo que esta pestaña ya había mirado');
  });

  test('sin sonido: el aviso no crea audio', async () => {
    const M = await conUnaVieja();
    let sonidos = 0;
    M.P.ctx.AudioContext = class { constructor() { sonidos++; } };
    M.P.ev('_solicitudes.push(' + JSON.stringify(Object.assign({ origen: 'nube' }, ANA)) + '); pintarAvisoSolicitudesNuevas();');
    assert.match(sinEtiquetas(M.P.elems.avisoSolicitudesNuevas.innerHTML), /Ana Inventada/);
    assert.equal(sonidos, 0);
  });

  test('en modo #equipo, nada de esto', async () => {
    const M = await conUnaVieja();
    M.P.ev('_solicitudes.push(' + JSON.stringify(Object.assign({ origen: 'nube' }, ANA)) + ')');
    M.P.ev('CARTERA_EQUIPO = { yo: { celular: "3000000000" } }; pintarAvisoSolicitudesNuevas();');
    assert.equal(M.P.elems.avisoSolicitudesNuevas.innerHTML, '');
    assert.equal(M.P.ev('solicitudesSinVer().length'), 0);
  });
});
