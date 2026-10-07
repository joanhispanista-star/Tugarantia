/* ===========================================================================
 * HISTORIALES-AUTO — LO QUE ENCONTRÓ LA REVISIÓN
 * 7 de octubre de 2026 (segunda vuelta).
 *
 * Dos revisiones adversarias (datos y robustez) de panel/historiales-auto.js
 * encontraron fallos que las pruebas del constructor no podían ver: su nube de
 * mentira no mudaba los mensajes ni rescataba la vinculación, y ningún caso
 * tenía dos fichas que la nube toma por la misma persona. Cada prueba de este
 * archivo FALLABA con la pieza del 7-oct (primera vuelta) y pasa con el
 * arreglo; el número del hallazgo va en el título.
 *
 * La nube de acá (nubeSQL) copia sincronizar_socios de
 * base/20260914b_tres_canales.sql §5-bis CON lo que el doble del constructor
 * no modelaba:
 *   · `update mensajes set cedula = ident where cedula = cel`;
 *   · el rescate de codigo_hash, codigo_propio y la vinculación de la fila
 *     del celular antes del `delete`, y el `coalesce` que se la deja a la
 *     fila nueva;
 *   · mi_cuenta() (la ficha que ve la sesión de un celular) y la entrada con
 *     cédula-o-celular + código (historial_socio_por_codigo).
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../app/motor.js');
const { abrirPanel } = require('./banco-panel.js');
const { cartera, azar } = require('./banco-nube-crm.js');
const { crear } = require('../panel/historiales-auto.js');

const RAIZ = path.join(__dirname, '..');
const FUENTE = fs.readFileSync(path.join(RAIZ, 'panel', 'historiales-auto.js'), 'utf8');
const KEY = 'joan_socios_v1';
const ESTADO = 'joan_crm_historiales';
const SELLO = 'joan_crm_sello';
const DUENO_NUBE = 'joan_crm_sync_dueno';
const DUENO_HIST = 'joan_crm_historiales_dueno';
const CLAVE = 'clave-de-prueba-bien-larga';
/* Un computador donde Joan ya tocó «☁ Subir historiales» una vez. */
const HABILITADO = JSON.stringify({ v: 1, socios: {}, habilitado: '2026-10-06T12:00:00.000Z' });
const tick = () => new Promise(r => setImmediate(r));

/* ------------------------------------------------------------------ dobles */
function nubeSQL() {
  const S = { filas: {}, mensajes: [], lotes: [], llamadas: 0, clave: CLAVE, modo: 'ok', reloj: 0 };
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');
  /* huella_codigo: null si el código no tiene 5 caracteres (20260810). */
  const H = c => { const n = M.normalizarCodigoAcceso(c == null ? null : String(c)); return n && n.length === 5 ? 'H(' + n + ')' : null; };
  S.H = H;
  function aplicar(lote) {
    let n = 0;
    S.reloj++;
    for (const item of lote) {
      const cel = dig(item.telefono) || null;
      /* El SQL de agosto (20260810) solo conocía la cédula: salta al resto
         sin quejarse y cuenta solo a los que subió. */
      const ident = S.modo === 'viejo' ? (dig(item.cedula) || null) : (dig(item.cedula) || cel);
      if (!ident) continue;
      const forzar = item.codigo_forzar === true;
      let hViejo = null, propio = false, vEn = null, vCel = null;
      if (cel && cel !== ident) {
        S.mensajes.forEach(m => { if (m.cedula === cel) m.cedula = ident; });
        const f = S.filas[cel];
        if (f) { hViejo = f.codigo_hash; propio = !!f.codigo_propio; vEn = f.auth_vinculada_en; vCel = f.auth_celular; }
        delete S.filas[cel];
      }
      let h = H(item.codigo);
      if (hViejo != null && propio && !forzar) h = hViejo; else if (h == null) h = hViejo;
      const datos = JSON.parse(JSON.stringify(item.datos || {}));
      const a = S.filas[ident];
      if (!a) {
        S.filas[ident] = { celular: cel, nombre: item.nombre || 'Socio', datos, codigo_hash: h,
          codigo_propio: forzar ? false : propio, auth_vinculada_en: vEn, auth_celular: vCel, actualizado_en: S.reloj };
      } else {
        a.celular = cel; a.nombre = item.nombre || 'Socio'; a.datos = datos;
        a.codigo_hash = forzar ? (h != null ? h : a.codigo_hash) : a.codigo_propio ? a.codigo_hash : (h != null ? h : a.codigo_hash);
        a.codigo_propio = forzar ? false : a.codigo_propio;
        a.auth_vinculada_en = a.auth_vinculada_en != null ? a.auth_vinculada_en : vEn;
        a.auth_celular = a.auth_celular != null ? a.auth_celular : vCel;
        a.actualizado_en = S.reloj;
      }
      n++;
    }
    return n;
  }
  /* mi_cuenta() del celular de la sesión. */
  S.miCuenta = cel => {
    const c = Object.entries(S.filas).filter(([, f]) => f.auth_vinculada_en && f.auth_celular === cel)
      .sort((a, b) => b[1].actualizado_en - a[1].actualizado_en);
    return c.length ? { cedula: c[0][0], nombre: c[0][1].nombre } : null;
  };
  /* historial_socio_por_codigo: (cedula = ident or celular = ident) y la huella. */
  S.entrar = (ident, codigo) => {
    const h = H(codigo);
    const c = Object.entries(S.filas).filter(([k, f]) => (k === ident || f.celular === ident) && h && f.codigo_hash === h);
    return c.length ? c[0][1].nombre : null;
  };
  const resp = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(texto) });
  S.red = (url, cfg) => {
    if (!/\/rest\/v1\/rpc\/sincronizar_socios$/.test(url)) return Promise.reject(new Error('sin red en el banco'));
    S.llamadas++;
    const cuerpo = JSON.parse(cfg.body);
    S.lotes.push(cuerpo.p_lote);
    if (S.modo === 'sin-red') return Promise.reject(new TypeError('Failed to fetch'));
    if (S.modo === 'colgada') return new Promise(() => {});
    if (cuerpo.p_clave !== S.clave) return Promise.resolve(resp(400, '{"code":"P0001","message":"clave de sincronización incorrecta"}'));
    return Promise.resolve(resp(200, String(aplicar(cuerpo.p_lote))));
  };
  return S;
}

function relojMovil(inicio) {
  const Real = Date;
  let t = new Real(inicio).getTime();
  function D(...a) { if (!(this instanceof D)) return new Real(t).toString(); return a.length ? new Real(...a) : new Real(t); }
  D.prototype = Real.prototype; D.now = () => t; D.parse = Real.parse; D.UTC = Real.UTC; D.avanzar = ms => { t += ms; };
  return D;
}
/* Relojes Y intervalos en la misma cola; los intervalos no se gastan. */
function relojes(P) {
  const cola = []; let n = 0;
  P.ctx.setTimeout = (f, ms) => { const id = ++n; cola.push({ id, f, ms }); return id; };
  P.ctx.clearTimeout = id => { const i = cola.findIndex(x => x.id === id); if (i >= 0) cola.splice(i, 1); };
  P.ctx.setInterval = (f, ms) => { const id = ++n; cola.push({ id, f, ms, intervalo: true }); return id; };
  P.ctx.clearInterval = P.ctx.clearTimeout;
  return {
    cola,
    hay: ms => cola.some(x => x.ms === ms && !x.intervalo),
    disparar(ms) {
      const toca = cola.filter(x => x.ms === ms);
      toca.forEach(x => { if (!x.intervalo) cola.splice(cola.indexOf(x), 1); x.f(); });
      return toca.length;
    }
  };
}
function conCodigos(db, semilla) { const r = azar(semilla || 7); db.socios.forEach(s => { s.codigoAcceso = M.generarCodigoAcceso(r); }); return db; }

function montar(o) {
  o = o || {};
  const srv = o.srv || nubeSQL();
  const P = abrirPanel({ red: (u, c) => srv.red(u, c) });
  const reloj = relojMovil(o.ahora || '2026-10-07T15:00:00.000Z');
  P.ctx.Date = reloj;
  const t = relojes(P);
  /* `storage` y `online` se anotan para poder dispararlos a mano. */
  P.oyentes = {};
  P.ctx.addEventListener = (tipo, f) => { (P.oyentes[tipo] = P.oyentes[tipo] || []).push(f); };
  P.cargarCartera(o.db || conCodigos(cartera(o.n || 3, o.por == null ? 1 : o.por)));
  P.ev('_selloDesdeDisco(false)');
  if (o.conexion !== false) P.almacen['joan_socios_sb'] = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  if (o.estado !== null) P.almacen[ESTADO] = o.estado || HABILITADO;
  P.ocupado = false;
  P.elems.modal.classList.contains = () => P.ocupado;
  P.ctx._preguntas = [];
  P.ctx.confirm = m => { P.ctx._preguntas.push(String(m)); return true; };
  vm.runInContext(FUENTE, P.ctx, { filename: 'historiales-auto.js' });
  if (o.entrar !== false) { P.ev('document.getElementById("pinInput").value = DB.config.pin'); P.ev('entrar()'); }
  return { P, srv, t, reloj };
}
const listo = m => m.P.ev('HistorialesAuto.listo()');
async function primera(m) { m.t.disparar(5000); await listo(m); return m.P.ev('HistorialesAuto.estado()'); }
async function cambiar(m, js) { m.P.ev(js + '; guardar()'); m.t.disparar(90000); await listo(m); return m.P.ev('HistorialesAuto.estado()'); }
async function boton(m) { m.P.ev('sincronizarSocios()'); for (let i = 0; i < 6; i++) { await listo(m); await tick(); } }
const cinta = m => m.P.ev('HistorialesAuto.estado()').cinta;
const huellas = m => JSON.parse(m.P.almacen[ESTADO] || '{}').socios || {};
const nombresSubidos = m => m.srv.lotes.flat().map(x => x.nombre);
const avisar = (m, key) => (m.P.oyentes.storage || []).forEach(f => f({ key }));
const sinAvisos = m => {
  assert.deepEqual(m.P.ctx._preguntas, [], 'el camino automático preguntó: ' + m.P.ctx._preguntas.join(' | '));
  assert.deepEqual(m.P.ctx._avisos || [], [], 'el camino automático saltó un alert: ' + (m.P.ctx._avisos || []).join(' | '));
};

/* La pareja que comparte línea (crm.html, «la pareja que comparte linea»):
   Ana tiene cédula y su WhatsApp es P; Beto no tiene cédula y su celular es P.
   En la nube Beto vive en la fila P, ya vinculado desde su teléfono Q y con
   un mensaje suyo en el chat. */
const P_ = '3157778899', Q = '3009990000';
function parejaQueComparteLinea(o) {
  o = o || {};
  const db = conCodigos(cartera(3, 1));
  const A = db.socios[0], B = db.socios[1];
  A.nombre = 'Ana'; A.cedula = '52111222'; A.telefono = P_;
  B.nombre = 'Beto'; B.cedula = ''; B.telefono = P_;
  if (o.betoPrimero) { db.socios[0] = B; db.socios[1] = A; }
  const srv = nubeSQL();
  srv.filas[P_] = { celular: P_, nombre: 'Beto', datos: {}, codigo_hash: srv.H(B.codigoAcceso), codigo_propio: false,
    auth_vinculada_en: '2026-10-01', auth_celular: Q, actualizado_en: 0 };
  srv.filas['52111222'] = { celular: P_, nombre: 'Ana', datos: {}, codigo_hash: srv.H(A.codigoAcceso), codigo_propio: false,
    auth_vinculada_en: null, auth_celular: null, actualizado_en: 0 };
  srv.mensajes.push({ cedula: P_, de: 'socio', texto: 'Joan, soy Beto: te pagué por Nequi' });
  return { db, srv, A, B };
}
function betoSigueSiendoBeto(srv, B) {
  assert.ok(srv.filas[P_], 'la fila de Beto desapareció de la nube');
  assert.equal(srv.entrar(P_, B.codigoAcceso), 'Beto', 'Beto ya no entra con su celular y su código');
  assert.equal((srv.miCuenta(Q) || {}).cedula, P_, 'la sesión de Beto ve la ficha de otra persona');
  assert.equal(srv.mensajes[0].cedula, P_, 'el mensaje de Beto quedó en el hilo de otra persona');
}

/* ======================================================================== */
describe('[datos 1-3] dos fichas que la nube toma por la misma persona', () => {

  for (const betoPrimero of [false, true]) {
    test('celular compartido (' + (betoPrimero ? 'Beto' : 'Ana') + ' primero en la cartera): no sube ninguno de los dos, ni solo ni con el botón, y Beto sigue siendo Beto', async () => {
      const { db, srv, B } = parejaQueComparteLinea({ betoPrimero });
      const m = montar({ db, srv });
      await primera(m);
      await cambiar(m, 'const p=DB.prestamos.find(x=>x.socioId==="C0"); p.pagado=true; p.fechaPagado="2026-10-07"');
      m.reloj.avanzar(31 * 60000); m.t.disparar(1800000); await listo(m);
      const subidos = nombresSubidos(m);
      assert.ok(!subidos.includes('Ana') && !subidos.includes('Beto'), 'la subida sola mandó a la pareja: ' + subidos.join(','));
      assert.ok(subidos.includes('Socio 2'), 'el que no choca con nadie dejó de subir');
      betoSigueSiendoBeto(srv, B);
      const c = cinta(m);
      assert.notEqual(c.clase, 'calma');
      assert.match(c.l2, /2 clientes comparten celular o cédula con otra ficha y no suben/);
      assert.match(c.l2, /Ana/); assert.match(c.l2, /Beto/);
      assert.match(c.l2, /ponle la cédula a quien no la tiene/);
      sinAvisos(m);
      /* El botón tampoco: subirlos le pasaba a Ana la vinculación de Beto. */
      await boton(m);
      assert.ok(!nombresSubidos(m).includes('Ana') && !nombresSubidos(m).includes('Beto'), 'el botón mandó a la pareja');
      betoSigueSiendoBeto(srv, B);
      assert.match(m.P.elems.sbEstado.textContent, /2 no subieron porque comparten celular o cédula con otra ficha/);
    });
  }

  test('código regenerado de Ana con el celular compartido: Ana no queda con el código de Beto', async () => {
    const { db, srv, A, B } = parejaQueComparteLinea();
    const viejoA = A.codigoAcceso;
    const m = montar({ db, srv });
    await primera(m);
    const nuevo = M.generarCodigoAcceso(azar(99));
    await cambiar(m, 'DB.socios[0].codigoAcceso=' + JSON.stringify(nuevo) + '; DB.socios[0].codigoForzar=true; const p=DB.prestamos.find(x=>x.socioId==="C0"); p.pagado=true; p.fechaPagado="2026-10-07"');
    assert.equal(srv.entrar('52111222', B.codigoAcceso), null, 'la cédula de Ana abre con el código de Beto');
    assert.equal(srv.entrar('52111222', viejoA), 'Ana', 'Ana perdió el código que tenía');
    betoSigueSiendoBeto(srv, B);
  });

  test('la misma cédula en dos fichas (cliente antiguo + ficha nueva): ninguna sube y no se turnan el código', async () => {
    const db = conCodigos(cartera(3, 1));
    db.socios[2].cedula = db.socios[0].cedula;           // la ficha nueva del mismo cliente
    db.socios[2].nombre = 'Socio 0 (ficha nueva)';
    const m = montar({ db });
    await primera(m);
    await cambiar(m, 'DB.socios[0].nombre="Socio 0 antiguo"');
    await cambiar(m, 'DB.socios[2].nombre="Socio 0 nuevo"');
    const subidos = nombresSubidos(m);
    assert.deepEqual([...new Set(subidos)], ['Socio 1'], 'subió alguna de las dos fichas con la misma cédula: ' + subidos.join(','));
    assert.match(cinta(m).l2, /2 clientes comparten celular o cédula/);
    m.srv.lotes.flat().forEach(x => assert.equal(x.codigo_forzar, false));
  });

  test('seguir el consejo de la línea (ponerle la cédula a Beto) no le pasa la cuenta de Beto a Ana', async () => {
    const db = conCodigos(cartera(3, 0));
    const A = db.socios[0], B = db.socios[1];
    A.nombre = 'Ana'; A.cedula = '52111222'; A.telefono = '3001111111';
    B.nombre = 'Beto'; B.cedula = ''; B.telefono = P_;
    const m = montar({ db });
    await primera(m);                                     // Beto vive en la nube en la fila P
    assert.ok(m.srv.filas[P_]);
    Object.assign(m.srv.filas[P_], { auth_vinculada_en: '2026-10-07', auth_celular: Q });
    m.srv.mensajes.push({ cedula: P_, de: 'socio', texto: 'hola, soy Beto' });
    /* Ana pasa a usar la línea de Beto: chocan y no sube ninguno. */
    await cambiar(m, 'DB.socios[0].telefono=' + JSON.stringify(P_));
    betoSigueSiendoBeto(m.srv, B);
    assert.match(cinta(m).l2, /comparten celular o cédula/);
    /* Joan le pone la cédula a Beto, como dice la línea. */
    await cambiar(m, 'DB.socios[1].cedula="79000111"');
    assert.equal((m.srv.miCuenta(Q) || {}).cedula, '79000111', 'la sesión de Beto quedó viendo otra ficha');
    assert.equal(m.srv.entrar('79000111', B.codigoAcceso), 'Beto', 'Beto perdió su código al mudarse a su cédula');
    assert.equal(m.srv.mensajes[0].cedula, '79000111', 'el chat de Beto se fue con Ana');
    assert.equal(m.srv.filas['52111222'].auth_celular, null, 'Ana se quedó con la vinculación de Beto');
    assert.doesNotMatch(cinta(m).l2, /comparten celular/);
  });
});

/* ======================================================================== */
describe('[datos 4 / robustez 1] la primera vez en un computador es del botón', () => {

  test('sin nada subido desde este computador, no sube solo: pide el botón una vez y desde ahí sí', async () => {
    const m = montar({ estado: null });
    await primera(m);
    await cambiar(m, 'DB.socios[0].nombre="Cambio"');
    m.reloj.avanzar(31 * 60000); m.t.disparar(1800000); await listo(m);
    assert.equal(m.srv.llamadas, 0, 'subió sola una cartera que nadie confirmó en este computador');
    const c = cinta(m);
    assert.equal(c.fase, 'primera-vez');
    assert.equal(c.l1, 'Los historiales todavía no suben solos en este computador');
    assert.match(c.l2, /Toca ☁ Subir historiales una vez/);
    assert.notEqual(c.clase, 'calma');
    sinAvisos(m);
    await boton(m);
    assert.equal(m.srv.lotes.length, 1);
    assert.equal(m.srv.lotes[0].length, 3);
    assert.ok(JSON.parse(m.P.almacen[ESTADO]).habilitado, 'el botón no dejó encendida la subida sola');
    await cambiar(m, 'DB.socios[1].nombre="Ya Sube Solo"');
    assert.deepEqual(m.srv.lotes[m.srv.lotes.length - 1].map(x => x.nombre), ['Ya Sube Solo']);
  });

  test('una cartera vieja abierta en otro origen no pisa lo que ven los clientes', async () => {
    const srv = nubeSQL();
    const base = conCodigos(cartera(3, 1));
    const vieja = JSON.parse(JSON.stringify(base));
    const hoy = JSON.parse(JSON.stringify(base));
    const p0 = hoy.prestamos.find(p => p.socioId === 'C0'); p0.pagado = true; p0.fechaPagado = '2026-10-01'; p0.gananciaPago = 20000;
    const bueno = montar({ db: hoy, srv, estado: null });
    await boton(bueno);
    const ced0 = hoy.socios[0].cedula;
    assert.equal(srv.filas[ced0].datos.creditos[0].pagado, true);
    const n = srv.llamadas;
    const viejo = montar({ db: vieja, srv, estado: null });
    await primera(viejo);
    assert.equal(srv.llamadas, n, 'el origen viejo subió solo');
    assert.equal(srv.filas[ced0].datos.creditos[0].pagado, true, 'un crédito pagado volvió a salir debido');
  });

  test('importar un respaldo pausa la subida sola hasta que Joan toque el botón', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const viejo = JSON.parse(m.P.almacen[KEY]); viejo.socios[0].nombre = 'Del Respaldo';
    const n = m.srv.llamadas;
    m.P.ev('importar({target:{files:[{texto:' + JSON.stringify(JSON.stringify(viejo)) + '}],value:""}})');
    m.t.disparar(90000); await listo(m);
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(m.srv.llamadas, n, 'el respaldo importado subió solo');
    assert.equal(cinta(m).l1, 'Importaste un respaldo: los historiales no suben solos hasta que lo confirmes');
    await boton(m);
    assert.ok(nombresSubidos(m).includes('Del Respaldo'));
    await cambiar(m, 'DB.socios[2].nombre="Después Del Botón"');
    assert.deepEqual(m.srv.lotes[m.srv.lotes.length - 1].map(x => x.nombre), ['Después Del Botón']);
  });
});

/* ======================================================================== */
describe('[datos 5-6] lo que no quedó guardado y lo que se borró', () => {

  test('si la cartera no se pudo guardar, no sube lo que se perdería al recargar', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const ced0 = m.P.ev('DB.socios[0].cedula');
    const orig = m.P.ctx.localStorage.setItem;
    m.P.ctx.localStorage.setItem = (k, v) => {
      if (k === KEY) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      return orig(k, v);
    };
    m.P.ev('const p=DB.prestamos.find(x=>x.socioId==="C0"); p.pagado=true; p.fechaPagado="2026-10-07"; guardar()');
    const n = m.srv.llamadas;
    m.reloj.avanzar(31 * 60000); m.t.disparar(1800000); await listo(m);
    await m.P.ev('HistorialesAuto.vuelta(true)');
    assert.equal(m.srv.llamadas, n, 'subió un pago que no quedó guardado');
    assert.equal(m.srv.filas[ced0].datos.creditos[0].pagado, false);
    const c = cinta(m);
    assert.equal(c.fase, 'sin-guardar');
    assert.equal(c.l1, 'Tu cartera no se pudo guardar: no subo lo que no quedó guardado');
    /* Vuelve a caber: guarda y sube. */
    m.P.ctx.localStorage.setItem = orig;
    await cambiar(m, 'void 0');
    assert.equal(m.srv.filas[ced0].datos.creditos[0].pagado, true);
    sinAvisos(m);
  });

  test('una ficha borrada sigue en la nube y la línea lo dice', async () => {
    const m = montar({ n: 3, por: 0 });
    await primera(m);
    m.P.ev('borrarCliente("C1")');
    m.P.ctx._preguntas = [];                               // el confirm() es del botón de borrar
    m.t.disparar(90000); await listo(m);
    const c = cinta(m);
    assert.match(c.l2, /1 ficha que borraste sigue en la nube/);
    assert.ok(huellas(m).C1, 'se olvidó de la fila que sigue publicada');
    /* Y no la vuelve a subir. */
    const n = m.srv.llamadas;
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(m.srv.llamadas, n);
  });
});

/* ======================================================================== */
describe('[robustez] la línea dice la verdad y la subida no se cuelga', () => {

  test('[3] otra página reemplaza la cartera: la línea no dice «nada esperando» y sube a los 90 s', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const db = JSON.parse(m.P.almacen[KEY]); db.socios[1].nombre = 'Traído Del Celular';
    m.P.almacen[KEY] = JSON.stringify(db);
    delete m.P.almacen[SELLO];                              // lo que hace traer.html
    avisar(m, KEY);
    await tick();
    assert.equal(m.P.ev('DB.socios[1].nombre'), 'Traído Del Celular', 'el CRM no se recargó');
    assert.notEqual(cinta(m).fase, 'al-dia', 'la línea dice que no hay nada por subir');
    assert.ok(m.t.hay(90000), 'nadie armó la subida');
    m.t.disparar(90000); await listo(m);
    assert.deepEqual(m.srv.lotes[m.srv.lotes.length - 1].map(x => x.nombre), ['Traído Del Celular']);
    assert.equal(cinta(m).fase, 'al-dia');
  });

  test('[4] la nube que no se alcanza CON internet no se llama «Sin internet»', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    m.srv.modo = 'sin-red';
    await cambiar(m, 'DB.socios[0].nombre="No Llega"');
    const c = cinta(m);
    assert.equal(c.fase, 'sin-llegar');
    assert.equal(c.l1, 'No pude llegar a la nube: 1 cliente con cambios esperando subir');
    assert.match(c.l2, /URL en Ajustes/);
    assert.match(c.l2, /Probar conexión/);
    assert.doesNotMatch(c.l1 + ' ' + c.l2, /Sin internet/);
    assert.ok(m.t.hay(180000), 'no vuelve a probar sola');
  });

  test('[5] un cambio cuyos 90 s vencen con una subida en el aire no se pierde', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const pend = [], red0 = m.srv.red;
    m.srv.red = (u, c) => new Promise(res => pend.push(() => res(red0(u, c))));
    m.P.ev('DB.socios[0].nombre="Primero"; guardar()'); m.t.disparar(90000); await tick();
    m.P.ev('DB.socios[2].nombre="A Mitad"; guardar()'); m.t.disparar(90000); await tick();
    pend.splice(0).forEach(f => f());
    for (let i = 0; i < 10; i++) await tick();
    await listo(m);
    m.srv.red = red0;
    assert.ok(m.t.hay(90000), 'el cambio de a mitad se quedó sin reloj');
    assert.notEqual(cinta(m).fase, 'al-dia');
    m.t.disparar(90000); await listo(m);
    assert.deepEqual(m.srv.lotes[m.srv.lotes.length - 1].map(x => x.nombre), ['A Mitad']);
  });

  test('[6] una nube que no contesta corta a los 40 s, lo dice y el botón no se queda colgado', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    const antes = JSON.stringify(huellas(m));
    m.srv.modo = 'colgada';
    m.P.ev('DB.socios[0].nombre="Colgado"; guardar()'); m.t.disparar(90000); await tick();
    assert.equal(cinta(m).fase, 'subiendo');
    assert.ok(m.t.hay(40000), 'la llamada no tiene tiempo límite');
    m.t.disparar(40000); await listo(m);
    const c = cinta(m);
    assert.equal(c.fase, 'error');
    assert.match(c.l2, /no contestó en 40 s/);
    assert.equal(JSON.stringify(huellas(m)), antes, 'anotó como subido lo que nadie confirmó');
    assert.ok(m.t.hay(180000));
    /* El botón también corta. */
    m.P.ev('sincronizarSocios()'); await tick();
    m.t.disparar(40000); for (let i = 0; i < 6; i++) { await listo(m); await tick(); }
    assert.match(m.P.elems.sbEstado.textContent, /^No se pudo subir/);
  });

  test('[7] con la clave rechazada, tocar la línea lleva a Ajustes y no gasta intentos del freno', async () => {
    const m = montar({ n: 2 });
    m.srv.clave = 'la-de-supabase-es-otra-distinta';
    await primera(m);
    assert.equal(m.srv.llamadas, 1);
    for (let i = 0; i < 4; i++) await m.P.ev('HistorialesAuto.accion()');
    assert.equal(m.srv.llamadas, 1, 'cada clic gastó un intento de los 10 del freno global');
    assert.equal(cinta(m).fase, 'clave');
    assert.match(cinta(m).l2, /Guardar conexión/);
    /* «Guardar conexión» sí prueba ya. */
    m.srv.clave = CLAVE;
    m.P.ev('document.getElementById("cfgSbUrl").value="https://prueba.supabase.co"; document.getElementById("cfgSbAnon").value="llave-anon"; document.getElementById("cfgSbClave").value=' + JSON.stringify(CLAVE) + '; guardarSupabase()');
    m.t.disparar(1500); await listo(m);
    assert.equal(m.srv.llamadas, 2);
    assert.equal(cinta(m).fase, 'al-dia');
  });

  test('[8] si la nube acepta menos de los que se mandaron (SQL viejo), no los anota y lo dice', async () => {
    const db = conCodigos(cartera(3, 0));
    db.socios[1].cedula = '';                              // el SQL de agosto lo salta
    const m = montar({ db });
    m.srv.modo = 'viejo';
    await primera(m);
    assert.equal(m.srv.lotes.length, 1);
    const c = cinta(m);
    assert.equal(c.fase, 'parcial');
    assert.equal(c.l1, 'La nube aceptó 2 de 3 clientes: le falta una actualización');
    assert.match(c.l2, /base\/supabase\.sql/);
    assert.deepEqual(huellas(m), {}, 'anotó como subidos a clientes que la nube saltó');
  });

  test('[10] días sin cambios: «tus clientes ven lo de hace un momento», no la fecha de la última subida', async () => {
    const m = montar({ n: 2, por: 0 });
    await primera(m);
    m.reloj.avanzar(3 * 86400000);
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(m.srv.lotes.length, 1);
    assert.equal(cinta(m).l1, 'Tus clientes ven lo de hace un momento');
  });

  test('[11] una pestaña vieja del CRM (con nube-crm y sin esta pieza) no deja a todos sin subir', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    m.P.ev('DB.socios[0].nombre="Desde Esta"; guardar()');
    const s = JSON.parse(m.P.almacen[SELLO]);
    m.P.almacen[SELLO] = JSON.stringify(Object.assign({}, s, { quien: 'OTRA' }));
    m.P.almacen[DUENO_NUBE] = JSON.stringify({ id: 'OTRA', latido: m.reloj.now(), enVuelta: false });
    delete m.P.almacen[DUENO_HIST];
    m.t.disparar(90000); await listo(m);
    assert.deepEqual(m.srv.lotes[m.srv.lotes.length - 1].map(x => x.nombre), ['Desde Esta'],
      'nadie sube: la otra pestaña tiene el sello de la cartera pero no sube historiales');
    /* Si la otra pestaña SÍ sube historiales (late en su llave), esta le deja
       el turno: dos pestañas no mandan lo mismo dos veces. */
    const n = m.srv.llamadas;
    m.P.ev('DB.socios[1].nombre="Lo Sube La Otra"; guardar()');
    m.P.almacen[SELLO] = JSON.stringify(Object.assign({}, JSON.parse(m.P.almacen[SELLO]), { quien: 'OTRA' }));
    m.P.almacen[DUENO_HIST] = JSON.stringify({ id: 'OTRA', latido: m.reloj.now() });
    m.t.disparar(90000); await listo(m);
    assert.equal(cinta(m).fase, 'otra-pestana');
    assert.equal(m.srv.llamadas, n, 'subieron las dos pestañas');
  });

  test('[13] un 300 de PostgREST que nombra p_clave no se lee como «clave rechazada»', () => {
    const H = crear({ almacen: { getItem: () => null, setItem() {}, removeItem() {} }, documento: null });
    const k = H._puro.clasificar;
    const pgrst203 = '{"code":"PGRST203","message":"Could not choose the best candidate function between: public.sincronizar_socios(p_clave => text, p_lote => jsonb), public.sincronizar_socios(p_clave => text, p_lote => json)"}';
    assert.notEqual(k({ ok: false, status: 300, texto: pgrst203 }).fase, 'clave');
    assert.equal(k({ ok: false, status: 300, texto: pgrst203 }).fase, 'error');
    assert.equal(k({ ok: false, status: 400, texto: '{"message":"clave de sincronización incorrecta"}' }).fase, 'clave');
    assert.equal(k({ ok: false, status: 400, texto: '{"message":"clave de sincronizacion incorrecta"}' }).fase, 'clave');
  });
});
