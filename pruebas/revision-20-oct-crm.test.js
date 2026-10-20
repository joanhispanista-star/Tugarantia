/* ============================================================================
 * LA REVISIÓN DEL 20-OCT, EN LAS PANTALLAS — 20 de octubre de 2026
 *
 *   node --test pruebas/revision-20-oct-crm.test.js
 *
 * La revisión adversaria de los 7 puntos del 19-oct dejó, entre otros, cinco
 * hallazgos que viven en el CRM y en app/aparato.js. Cada uno se prueba
 * ABRIENDO la página con su banco (banco-panel) y, donde hace falta, una nube
 * de mentira; cada prueba falla con el código de antes:
 *
 *   F2  «📱 Ver al registrarse, al pedir y al aceptar» pintaba la PRIMERA IP
 *       de x-forwarded-for, la que puede escribir el teléfono. Ahora, con
 *       varias públicas, salen todas con «⚠️ IP en cadena» (la regla de
 *       bloqueHuella), y la constancia dice que guarda solo la primera.
 *   F3  «💬 Escribirle por la app» desde 📥 Registrados escribía en el hilo de
 *       un celular sin cuenta: lo leía el primero que abriera una con ese
 *       número. Ahora pregunta a la nube si tiene cuenta y, si no, no abre y
 *       dice por qué.
 *   F10 El gerente proponía sin ver el estimado que vio el cliente. Ahora lo ve
 *       arriba, en la vista previa y en la pregunta final, como Joan.
 *   F13 Un iPad visto solo por la cabecera salía «Mac · Safari — Es un
 *       computador». Ahora «Mac o iPad», sin afirmar que es un computador.
 *   F16 «Desde dónde se registró» juntaba el teléfono de un día con la IP, el
 *       GPS y la fecha de otro. Ahora cada cosa va con su día, y lo del
 *       teléfono de otro día sale aparte.
 *
 * Las de la base (F1, F2 y F16 en SQL) están en el-gerente-no-se-propone-
 * postgres.test.js y aparato-postgres.test.js.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const A = require('../app/aparato.js');

const CLAVE = 'clave-de-prueba-bien-larga';
const CFG = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const CONGELADA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DIA1 = '2026-10-01T15:00:00Z', DIA4 = '2026-10-04T15:00:00Z';
const INFORMADO = { plataforma: 'android', modelo: 'SM-A155M', sistema_version: '14', navegador: 'Chrome',
                    navegador_version: '129', via: 'app_tu_garantia' };
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* Una respuesta de la nube con la forma que leen rpc() del CRM y app/chat.js. */
const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
  text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)),
  json: () => Promise.resolve(cuerpo) });
/* Por nombre de función; lo que no está contesta 404, como una función que la
   base todavía no tiene. Anota cada llamada. */
function nube(o) {
  const vistas = [];
  const red = (url, cfg) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(String(url)) || [])[1];
    let cuerpo = null;
    try { cuerpo = cfg && cfg.body ? JSON.parse(cfg.body) : null; } catch (e) { cuerpo = null; }
    vistas.push({ fn, cuerpo });
    if (o[fn] === undefined) return Promise.resolve(resp(404, { message: 'no existe' }));
    const r = typeof o[fn] === 'function' ? o[fn](cuerpo) : o[fn];
    return Promise.resolve(r && r.status ? resp(r.status, r.cuerpo) : resp(200, r));
  };
  return { vistas, red, de: fn => vistas.filter(v => v.fn === fn) };
}

/* El CRM con los módulos que carga con <script src> y que el banco no trae, y
   con la nube de mentira para rpc() (su fetch) y para app/chat.js (el fetch de
   Node, que se cambia mientras dura la prueba). */
function panel(o) {
  o = o || {};
  const N = o.nube || null;
  const P = abrirPanel(N ? { red: (u, c) => N.red(u, c) } : {});
  P.ctx.CuentaSocio = require('../app/cuenta.js');
  P.ctx.Aparato = A;
  P.ctx.UbicacionIP = require('../app/ubicacion-ip.js');
  if (N) P.almacen.joan_socios_sb = CFG;
  return P;
}
async function conNube(N, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = (u, c) => N.red(u, c);
  try { await fn(); } finally { globalThis.fetch = real; }
}

/* ==========================================================================
 * F13 — UN IPAD NO ES UN COMPUTADOR
 * ======================================================================== */
describe('F13: lo que solo dijo la cabecera de un iPad es «Mac o iPad»', () => {

  test('app/aparato.js: la huella vieja y la constancia dicen «Mac o iPad», sin «es un computador»', () => {
    const w = A.deLaHuella({ aparato: IPAD });
    assert.equal(w.texto, 'Mac o iPad · Safari');
    assert.notEqual(w.nota, A.NOTA.computador, 'afirma que es un computador sin poder saberlo');
    assert.match(w.nota, /no se distingue un Mac de un iPad/);
    const filas = A.filasDeAparatos([{ cuando: 'aceptacion', momento: DIA1, ip: '181.50.1.2', ua: IPAD, declarado: {}, origen: 'constancia' }]);
    assert.equal(filas[0].texto, 'Mac o iPad · Safari');
    assert.doesNotMatch(filas[0].nota, /computador/);
  });

  test('lo que dijo el TELÉFONO (que sí mira la pantalla táctil) sigue diciendo «Mac» y «computador»', () => {
    const w = A.enPalabras({ plataforma: 'mac', navegador: 'Safari' });
    assert.equal(w.texto, 'Mac · Safari');
    assert.equal(w.nota, A.NOTA.computador);
  });

  test('el CRM: «Tipo de celular» de un iPad viejo, en la ficha de Joan y en la del gerente', () => {
    const P = panel();
    const h = P.ev('bloqueHuella(' + JSON.stringify({ ip: '181.50.1.2', aparato: IPAD, momento: DIA1 }) + ', {})');
    assert.match(h, /Tipo de celular<\/span><span class="vv">Mac o iPad · Safari/);
    assert.doesNotMatch(h, /Es un computador/);
    const f = P.ev('fichaHTML(' + JSON.stringify({ nombre: 'Ana', datos: {}, fotos: {}, huella: { aparato: IPAD, momento: DIA1 } }) + ')');
    assert.match(f, /Mac o iPad · Safari/);
    assert.doesNotMatch(f, /Es un computador/);
  });
});

/* ==========================================================================
 * F2 — LA IP DE CADA VEZ, CON LA REGLA DE LA CASA
 * ======================================================================== */
describe('F2: «📱 Ver al registrarse, al pedir y al aceptar» no muestra sola la IP que pone el teléfono', () => {

  test('app/aparato.js: con dos IPs públicas salen las dos y el aviso; con una pública, esa', () => {
    const [f] = A.filasDeAparatos([{ cuando: 'solicitud', momento: DIA1, ip: '181.50.1.2, 200.1.2.3', ua: CONGELADA, declarado: {}, origen: 'telefono' }]);
    assert.equal(f.ip, '181.50.1.2, 200.1.2.3', 'pintó solo la primera, la que escribe el teléfono');
    assert.equal(f.ipEnCadena, true);
    assert.match(f.notaIP, /La primera la puede escribir el propio teléfono/);
    /* Una pública y una interna: no hay cadena sospechosa, y la que vale es la pública. */
    const [g] = A.filasDeAparatos([{ cuando: 'solicitud', momento: DIA1, ip: '181.50.1.2, 10.0.0.1', ua: '', declarado: {}, origen: 'telefono' }]);
    assert.equal(g.ip, '181.50.1.2');
    assert.equal(g.ipEnCadena, false);
    assert.equal(g.notaIP, '');
    const [h] = A.filasDeAparatos([{ cuando: 'solicitud', momento: DIA1, ip: '10.0.0.1, 181.50.1.2', ua: '', declarado: {}, origen: 'telefono' }]);
    assert.equal(h.ip, '181.50.1.2', 'una dirección interna delante tapó la pública');
  });

  test('app/aparato.js: la constancia de la aceptación dice que guarda solo la primera', () => {
    const [f] = A.filasDeAparatos([{ cuando: 'aceptacion', momento: DIA1, ip: '181.50.1.9', ua: CONGELADA, declarado: {}, origen: 'constancia' }]);
    assert.equal(f.ip, '181.50.1.9');
    assert.match(f.notaIP, /guarda solo la primera dirección de la cadena/);
  });

  test('el CRM pinta las dos IPs con «⚠️ IP en cadena» y el porqué', async () => {
    const N = nube({ aparatos_de: { ok: true, aparatos: [
      { cuando: 'registro', momento: DIA1, ip: '181.50.1.2, 200.1.2.3', ua: CONGELADA, declarado: INFORMADO, origen: 'telefono' },
      { cuando: 'aceptacion', momento: DIA4, ip: '181.50.1.9', ua: CONGELADA, declarado: {}, origen: 'constancia' }] } });
    const P = panel({ nube: N });
    await P.ev('verAparatosDe("3001112233", "cajaAparatos")');
    const h = P.elems.cajaAparatos.innerHTML;
    assert.match(h, /IPs <span class="mono">181\.50\.1\.2, 200\.1\.2\.3<\/span>/, 'no salen todas las IPs de la cadena');
    assert.match(h, /⚠️ IP en cadena/);
    assert.match(plano(h), /La primera la puede escribir el propio teléfono/);
    assert.match(plano(h), /guarda solo la primera dirección de la cadena/, 'la constancia no dice que su IP es solo la primera');
  });
});

/* ==========================================================================
 * F3 — SIN CUENTA, NO SE ESCRIBE EN SU HILO
 * ======================================================================== */
describe('F3: «💬 Escribirle por la app» a un registrado sin cuenta', () => {
  const REG = { id: 41, nombre: 'María Registrada', cedula: '', telefono: '+57 316 123 4567', origen: 'abierto',
    estado: 'nuevo', creado_en: DIA1, datos: {} };
  function crm(N) {
    const P = panel({ nube: N });
    P.cargarCartera({ socios: [], prestamos: [], config: { negocio: 'Tu Garantía' } });
    P.ev('_registros = ' + JSON.stringify([REG]) + '; _chatAbierta = null;');
    return P;
  }
  const HILO = { chat_hilo_de_celular: { ok: true, hilo: '3161234567' }, chat_de: [], chat_conversaciones: [] };

  test('sin cuenta: NO abre la conversación, no pide el hilo, y dice por qué', async () => {
    const N = nube(Object.assign({ cuentas_de_registros: [{ registro_id: 41, celular: '3161234567', cuenta: false }] }, HILO));
    const P = crm(N);
    await conNube(N, async () => { P.ev("escribirlePorLaApp('registro','41')"); await asentar(); });
    assert.deepEqual(N.de('cuentas_de_registros').map(v => v.cuerpo), [{ p_clave: CLAVE, p_ids: [41] }]);
    assert.equal(P.ev('_chatAbierta'), null, 'abrió el hilo de un celular sin cuenta: lo leería quien primero abra una con ese número');
    assert.equal(N.de('chat_hilo_de_celular').length, 0);
    assert.match((P.ctx._avisos || []).join('\n'), /todavía no tiene cuenta en la app/);
    assert.match((P.ctx._avisos || []).join('\n'), /no está verificado/);
  });

  test('con cuenta: abre la de siempre, con el nombre rotulado', async () => {
    const N = nube(Object.assign({ cuentas_de_registros: [{ registro_id: 41, celular: '3161234567', cuenta: true }] }, HILO));
    const P = crm(N);
    await conNube(N, async () => { P.ev("escribirlePorLaApp('registro','41')"); await asentar(); });
    assert.equal(P.ev('_chatAbierta'), '3161234567');
    assert.equal(P.elems.mTitle.textContent, 'María Registrada (registrado, sin verificar)');
  });

  test('si la nube no sabe decir si tiene cuenta (falta la migración), tampoco abre', async () => {
    const N = nube(HILO);
    const P = crm(N);
    await conNube(N, async () => { P.ev("escribirlePorLaApp('registro','41')"); await asentar(); });
    assert.equal(P.ev('_chatAbierta'), null);
    assert.match((P.ctx._avisos || []).join('\n'), /20261007_una_puerta\.sql/);
  });
});

/* ==========================================================================
 * F10 — EL GERENTE VE EL ESTIMADO ANTES DE MANDAR
 * ======================================================================== */
describe('F10: la propuesta del gerente, con el estimado que vio el cliente', () => {
  const ahora = new Date().toISOString();
  const TOPES = { capital_max: 500000, costo_min: 10, costo_max: 20, dias_max: 30 };
  const conEstimado = { id: 11, estado: 'nueva', creada_en: ahora, pedido_monto: 300000,
    pedido: { capital: 300000, dias: 30, origen: 'play', estimado: { costo: 6000, total: 306000, tasa: 0.02, cuando: ahora } } };
  function gerente(sol) {
    const P = abrirPanel({ red: () => Promise.reject(new Error('sin red')) });
    P.ev('CARTERA_EQUIPO = ' + JSON.stringify({ ok: true, yo: { nombre: 'WILLIAN', rol: 'gerente', celular: '3000000000' }, equipo: [], gente: [] }) + ';');
    P.ev('VISTA_EQUIPO = "registros"; REG_EQ = ' + JSON.stringify({ estado: 'ok', topes: TOPES, motivo: '', registros: [
      { id: 1, nombre: 'María Gómez', telefono: '3101500001', cedula: '1010', por: 'base', asesor: '3000000000',
        asesor_nombre: 'WILLIAN', creado_en: ahora, datos: {}, huella: null, solicitudes: [sol] }] }) + ';');
    return P;
  }
  const llenar = (P, cap, pct, dias) => { P.elems.propEqCap.value = String(cap); P.elems.propEqPct.value = String(pct); P.elems.propEqDias.value = String(dias); };

  test('arriba del formulario dice lo que la app le estimó', () => {
    const P = gerente(conEstimado);
    P.ev('proponerEq(11)');
    assert.match(P.elems.mBody.innerHTML, /El cliente vio un estimado de \$6\.000 \(total \$306\.000\)/,
      'el gerente propone sin saber qué le estimó la app al cliente');
  });

  test('la vista previa y la pregunta final avisan cuando la propuesta lo supera; si no, callan', () => {
    const P = gerente(conEstimado);
    P.ev('proponerEq(11)');
    llenar(P, 300000, 20, 30);
    P.ev('previsualizarPropuestaEq()');
    assert.match(P.elems.propEqCalc.innerHTML, /⚠️ Tu propuesta \(\$60\.000\) es 10 veces lo que la app le estimó/,
      'la vista previa no avisa');
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return false; };
    P.ev('enviarPropuestaEq(11)');
    assert.equal(preguntas.length, 1);
    assert.match(preguntas[0], /⚠️ Tu propuesta \(\$60\.000\) es 10 veces lo que la app le estimó/, 'la pregunta final no avisa');
    /* Una que no lo supera: ni en la vista previa ni en la pregunta. */
    llenar(P, 60000, 10, 30);
    P.ev('previsualizarPropuestaEq()');
    assert.doesNotMatch(P.elems.propEqCalc.innerHTML, /⚠️/);
    P.ev('enviarPropuestaEq(11)');
    assert.doesNotMatch(preguntas[1], /⚠️/);
  });

  test('sin estimado guardado no se dice que el cliente vio uno', () => {
    const P = gerente(Object.assign({}, conEstimado, { pedido: { capital: 300000, dias: 30 } }));
    P.ev('proponerEq(11)');
    assert.doesNotMatch(P.elems.mBody.innerHTML, /vio un estimado/);
    llenar(P, 300000, 20, 30);
    P.ev('previsualizarPropuestaEq()');
    assert.doesNotMatch(P.elems.propEqCalc.innerHTML, /⚠️/);
  });
});

/* ==========================================================================
 * F16 — CADA COSA CON SU DÍA
 * ======================================================================== */
describe('F16: «Desde dónde se registró» no junta días distintos', () => {
  const GPS1 = { lat: 4.6, lng: -74.1, acc: 12, fecha: '2026-10-01' };

  test('app/aparato.js: lo del teléfono de otro día va aparte; en el bloque, la conexión de ese momento', () => {
    const r = A.aparatoDelRegistro({ ip: '181.50.1.2', momento: DIA1, aparato: CONGELADA,
      aparato_telefono: Object.assign({ momento: DIA4 }, INFORMADO) });
    assert.equal(r.dia, '2026-10-01');
    assert.equal(r.aparato.texto, 'Android · el modelo no se supo · Chrome 129');
    assert.equal(r.otroDia.texto, 'Samsung SM-A155M · Android 14 · Chrome 129 · app Tu Garantía');
    assert.equal(r.otroDia.dia, '2026-10-04');
    /* Del mismo día, en el bloque. Y de noche en Bogotá sigue siendo el mismo
       día aunque en UTC ya sea el siguiente. */
    const hoy = A.aparatoDelRegistro({ momento: '2026-10-02T01:00:00Z', aparato: CONGELADA,
      aparato_telefono: Object.assign({ momento: '2026-10-01T23:00:00Z' }, INFORMADO) });
    assert.equal(hoy.otroDia, null);
    assert.match(hoy.aparato.texto, /Samsung SM-A155M/);
  });

  test('el CRM: el teléfono del día 4 NO sale bajo la IP y el GPS del día 1', () => {
    const P = panel();
    const h = P.ev('bloqueHuella(' + JSON.stringify({ ip: '181.50.1.2', momento: DIA1, aparato: CONGELADA, gps: GPS1,
      aparato_telefono: Object.assign({ momento: DIA4 }, INFORMADO) }) + ', { registro: { id: 1, telefono: "3001112233", creado_en: "' + DIA1 + '" } })');
    const aparte = h.indexOf('Lo que informó el teléfono otro día');
    assert.ok(aparte > 0, 'lo del teléfono de otro día no sale aparte');
    assert.ok(h.indexOf('Samsung SM-A155M') > aparte, 'el teléfono del día 4 sale bajo «Desde dónde se registró», junto a la IP del día 1');
    assert.match(h, /Tipo de celular<\/span><span class="vv">Android · el modelo no se supo · Chrome 129/,
      'en el bloque no quedó lo que dijo la conexión ese mismo día');
    assert.ok(h.indexOf(P.ev('fmtFecha("2026-10-04")'), aparte) > aparte, 'lo de aparte no dice su fecha');
    assert.match(h, /Registrado el /);
  });

  test('el CRM: si la IP se leyó otro día que el registro y el GPS, lo dice y no los junta', () => {
    const P = panel();
    /* El camino «ya tenías cuenta»: el día 4 volvió a subir fotos (IP y
       momento nuevos), el GPS y el teléfono son del día 1. */
    const h = P.ev('bloqueHuella(' + JSON.stringify({ ip: '190.0.0.4', momento: DIA4, aparato: CONGELADA, gps: GPS1,
      aparato_telefono: Object.assign({ momento: DIA1 }, INFORMADO) }) + ', { registro: { id: 1, telefono: "3001112233", creado_en: "' + DIA1 + '" } })');
    assert.match(plano(h), /El punto es del .* y lo demás de aquí es del .*: no son del mismo momento/, 'el GPS de otro día no se marca');
    assert.match(plano(h), /La IP y la conexión se leyeron el .*; el registro es del .*: no son del mismo día/,
      'dice «Registrado el» con la fecha de la segunda subida');
    assert.doesNotMatch(h, /Registrado el /);
    assert.ok(h.indexOf('Samsung SM-A155M') > h.indexOf('Lo que informó el teléfono otro día'));
  });

  test('el CRM: todo del mismo día sigue igual, con la fecha de lo que informó el teléfono', () => {
    const P = panel();
    const h = P.ev('bloqueHuella(' + JSON.stringify({ ip: '181.50.1.2', momento: DIA1, aparato: CONGELADA, gps: GPS1,
      aparato_telefono: Object.assign({ momento: DIA1 }, INFORMADO) }) + ', { registro: { id: 1, telefono: "3001112233", creado_en: "' + DIA1 + '" } })');
    assert.match(h, /Tipo de celular<\/span><span class="vv">Samsung SM-A155M · Android 14/);
    assert.match(h, /Lo informó el /);
    assert.doesNotMatch(h, /otro día/);
  });

  test('la ficha del gerente tampoco los junta', () => {
    const P = panel();
    const f = P.ev('fichaHTML(' + JSON.stringify({ nombre: 'Ana', registrado_en: DIA1, datos: {}, fotos: {},
      huella: { momento: DIA1, aparato: CONGELADA, gps: GPS1, aparato_telefono: Object.assign({ momento: DIA4 }, INFORMADO) } }) + ')');
    const aparte = f.indexOf('Lo que informó el teléfono otro día');
    assert.ok(aparte > 0, 'William ve el teléfono del día 4 junto a la fecha del día 1');
    assert.ok(f.indexOf('Samsung SM-A155M') > aparte);
  });
});
