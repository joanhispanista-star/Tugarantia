/* ===========================================================================
 * LOS HISTORIALES SUBEN SOLOS — panel/historiales-auto.js
 * 7 de octubre de 2026.
 *
 * Joan: «quiero que el punto 1 sea automático, no manual». El punto 1 era
 * «☁ Subir historiales». Estas pruebas arrancan crm.html DE VERDAD (el banco
 * de pruebas/banco-panel.js) con la pieza nueva cargada como la carga el
 * navegador, contra una nube de mentira que aplica la MISMA regla de
 * sincronizar_socios (base/20260914b_tres_canales.sql): llave cédula o
 * celular, el código como huella, el código propio del socio que no se pisa
 * sin forzar, y el `coalesce` que conserva el código cuando llega null.
 *
 * Lo que vigilan, en el orden del pedido:
 *   · solo sube el cliente cuyo paquete cambió (y la primera vez, todos);
 *   · la huella se escribe SOLO con la respuesta buena de la nube;
 *   · lo que falla queda pendiente y vuelve a salir;
 *   · ni confirm() ni alert() en el camino automático;
 *   · nada antes del PIN ni en modo equipo;
 *   · el botón sigue subiendo a todos;
 *   · la subida sola no cambia ni genera el código de nadie;
 *   · 300 clientes: cuántas llamadas, y que el lote ya no es cuadrático;
 *   · y lo que dice la línea de estado en cada caso.
 * ========================================================================= */
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../app/motor.js');
const PU = require('../app/puente.js');
const { abrirPanel } = require('./banco-panel.js');
const { cartera, azar } = require('./banco-nube-crm.js');
const { crear } = require('../panel/historiales-auto.js');

const RAIZ = path.join(__dirname, '..');
const FUENTE = fs.readFileSync(path.join(RAIZ, 'panel', 'historiales-auto.js'), 'utf8');
const KEY = 'joan_socios_v1';
const ESTADO = 'joan_crm_historiales';
const SELLO = 'joan_crm_sello';
/* El latido propio de la pestaña que sube historiales (7-oct, segunda vuelta:
   antes se miraba el de nube-crm.js, joan_crm_sync_dueno). */
const DUENO = 'joan_crm_historiales_dueno';
const CLAVE = 'clave-de-prueba-bien-larga';
/* Un computador donde Joan ya tocó «☁ Subir historiales» una vez: desde la
   segunda vuelta del 7-oct la subida sola no arranca antes de eso (la prueba
   de esa puerta está en historiales-auto-revision.test.js). Estas pruebas
   miran la mecánica de la subida sola, así que parten de ahí. */
const HABILITADO = JSON.stringify({ v: 1, socios: {}, habilitado: '2026-10-06T12:00:00.000Z' });
const CAMPOS = ['cedula', 'telefono', 'nombre', 'codigo', 'codigo_forzar', 'datos'];
const tick = () => new Promise(r => setImmediate(r));

/* ------------------------------------------------------------------ dobles */

/* sincronizar_socios con la regla del SQL vivo (20260914b, sección 5-bis). */
function nubeDeMentira() {
  const S = { filas: {}, lotes: [], llamadas: 0, modo: 'ok', clave: CLAVE, colgadas: [], fallarDesde: null };
  const dig = v => String(v == null ? '' : v).replace(/\D/g, '');
  const huellaCodigo = c => { const n = M.normalizarCodigoAcceso(c == null ? null : String(c)); return n ? 'H(' + n + ')' : null; };
  S.huellaCodigo = huellaCodigo;
  function aplicar(lote) {
    let n = 0;
    for (const item of lote) {
      const cel = dig(item.telefono) || null;
      const ident = dig(item.cedula) || cel;
      if (!ident) continue;
      const forzar = item.codigo_forzar === true;
      let hViejo = null, propio = false;
      if (cel && cel !== ident && S.filas[cel]) {
        hViejo = S.filas[cel].codigo_hash; propio = !!S.filas[cel].codigo_propio; delete S.filas[cel];
      }
      let h = huellaCodigo(item.codigo);
      if (hViejo && propio && !forzar) h = hViejo; else if (h == null) h = hViejo;
      const datos = JSON.parse(JSON.stringify(item.datos || {}));
      const a = S.filas[ident];
      if (!a) {
        S.filas[ident] = { celular: cel, nombre: item.nombre || 'Socio', datos, codigo_hash: h, codigo_propio: forzar ? false : propio };
      } else {
        a.celular = cel; a.nombre = item.nombre || 'Socio'; a.datos = datos;
        a.codigo_hash = forzar ? (h != null ? h : a.codigo_hash) : a.codigo_propio ? a.codigo_hash : (h != null ? h : a.codigo_hash);
        a.codigo_propio = forzar ? false : a.codigo_propio;
      }
      n++;
    }
    return n;
  }
  const resp = (status, texto) => ({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(texto) });
  S.otras = [];
  S.red = (url, cfg) => {
    /* Ajustes y otras pantallas del CRM también le preguntan cosas a la nube
       (registros, mensajes): se anotan aparte y no cuentan como subida. */
    if (/\/rest\/v1\/rpc\/historial_socio_por_codigo$/.test(url)) { S.otras.push(url); return Promise.resolve(resp(200, 'null')); }
    if (!/\/rest\/v1\/rpc\/sincronizar_socios$/.test(url)) { S.otras.push(url); return Promise.reject(new Error('sin red en el banco')); }
    S.llamadas++;
    const cuerpo = JSON.parse(cfg.body);
    S.lotes.push(cuerpo.p_lote);
    S.ultimasCabeceras = cfg.headers;
    if (S.modo === 'sin-red') return Promise.reject(new TypeError('Failed to fetch'));
    if (S.fallarDesde != null && S.llamadas > S.fallarDesde) return Promise.resolve(resp(500, '{"message":"se cayó la base"}'));
    if (S.modo === '500') return Promise.resolve(resp(500, '{"message":"se cayó la base"}'));
    if (S.modo === '404') return Promise.resolve(resp(404, '{"code":"PGRST202","message":"Could not find the function"}'));
    if (S.modo === '401') return Promise.resolve(resp(401, '{"message":"Invalid API key"}'));
    if (cuerpo.p_clave !== S.clave) return Promise.resolve(resp(400, '{"code":"P0001","message":"clave de sincronización incorrecta"}'));
    if (S.modo === 'colgada') {
      return new Promise(res => S.colgadas.push(() => res(resp(200, String(aplicar(cuerpo.p_lote))))));
    }
    return Promise.resolve(resp(200, String(aplicar(cuerpo.p_lote))));
  };
  return S;
}

/* Un reloj que se puede adelantar, con la forma del de pruebas/reloj.js. */
function relojMovil(inicio) {
  const Real = Date;
  let t = new Real(inicio).getTime();
  function D(...a) {
    if (!(this instanceof D)) return new Real(t).toString();
    return a.length ? new Real(...a) : new Real(t);
  }
  D.prototype = Real.prototype;
  D.now = () => t;
  D.parse = Real.parse;
  D.UTC = Real.UTC;
  D.avanzar = ms => { t += ms; };
  return D;
}

/* Los relojes de la página, en una cola que la prueba dispara a mano. */
function relojes(P) {
  const cola = []; let n = 0;
  P.ctx.setTimeout = (f, ms) => { const id = ++n; cola.push({ id, f, ms }); return id; };
  P.ctx.clearTimeout = id => { const i = cola.findIndex(x => x.id === id); if (i >= 0) cola.splice(i, 1); };
  return {
    cola,
    hay: ms => cola.some(x => x.ms === ms),
    disparar(ms) {
      const toca = cola.filter(x => x.ms === ms);
      toca.forEach(x => { cola.splice(cola.indexOf(x), 1); x.f(); });
      return toca.length;
    }
  };
}

function conCodigos(db, semilla) {
  const r = azar(semilla || 7);
  db.socios.forEach(s => { s.codigoAcceso = M.generarCodigoAcceso(r); });
  return db;
}
const otroCodigo = (semilla) => M.generarCodigoAcceso(azar(semilla));

/* Lo que Joan pega en Ajustes → Compartir con mis clientes. */
function pegarConexion(m, clave) {
  m.P.ev('document.getElementById("cfgSbUrl").value = "https://prueba.supabase.co"');
  m.P.ev('document.getElementById("cfgSbAnon").value = "llave-anon"');
  m.P.ev('document.getElementById("cfgSbClave").value = ' + JSON.stringify(clave));
}
function entrar(P) { P.ev('document.getElementById("pinInput").value = DB.config.pin'); P.ev('entrar()'); }

function montar(o) {
  o = o || {};
  const srv = nubeDeMentira();
  const P = abrirPanel({ red: (u, c) => srv.red(u, c) });
  const reloj = relojMovil('2026-10-07T15:00:00.000Z');
  P.ctx.Date = reloj;
  const t = relojes(P);
  P.cargarCartera(o.db || conCodigos(cartera(o.n || 3, o.por == null ? 1 : o.por)));
  P.ev('_selloDesdeDisco(false)');
  if (o.conexion !== false) {
    P.almacen['joan_socios_sb'] = JSON.stringify(Object.assign({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE }, o.conexion || {}));
  }
  if (o.estado !== null) P.almacen[ESTADO] = o.estado || HABILITADO;
  /* estoyOcupado() de crm.html mira el modal; el banco no le da `contains`. */
  P.ocupado = false;
  P.elems.modal.classList.contains = () => P.ocupado;
  /* confirm() se anota: el camino automático no puede preguntar nada. */
  P.ctx._preguntas = [];
  P.ctx.confirm = m => { P.ctx._preguntas.push(String(m)); return true; };
  if (o.modulo !== false) vm.runInContext(FUENTE, P.ctx, { filename: 'historiales-auto.js' });
  if (o.entrar !== false) entrar(P);
  return { P, srv, t, reloj };
}
const listo = m => m.P.ev('HistorialesAuto.listo()');
async function primera(m) { m.t.disparar(5000); await listo(m); return m.P.ev('HistorialesAuto.estado()'); }
async function cambiar(m, js) {
  m.P.ev(js + '; guardar()');
  m.t.disparar(90000);
  await listo(m);
  return m.P.ev('HistorialesAuto.estado()');
}
const cinta = m => m.P.ev('HistorialesAuto.estado()').cinta;
const huellas = m => JSON.parse(m.P.almacen[ESTADO] || '{}').socios || {};
const cedulaDe = (m, id) => m.P.ev('DB.socios.find(s=>s.id===' + JSON.stringify(id) + ').cedula');
const sinAvisos = m => {
  assert.deepEqual(m.P.ctx._preguntas, [], 'el camino automático preguntó: ' + m.P.ctx._preguntas.join(' | '));
  assert.deepEqual(m.P.ctx._avisos || [], [], 'el camino automático saltó un alert: ' + (m.P.ctx._avisos || []).join(' | '));
};

/* ======================================================================== */
describe('solo sube el cliente que cambió', () => {

  test('después del PIN suben todos UNA vez, sin el id interno y sin forzar nada', async () => {
    const m = montar({ n: 3 });
    assert.equal(m.srv.llamadas, 0, 'subió antes de la primera vuelta');
    const e = await primera(m);
    assert.equal(m.srv.lotes.length, 1);
    const lote = m.srv.lotes[0];
    assert.equal(lote.length, 3);
    lote.forEach(x => {
      assert.deepEqual(Object.keys(x).sort(), CAMPOS.slice().sort(), 'viajó algo que sincronizar_socios no espera (¿el socioId?)');
      assert.equal(x.codigo_forzar, false);
    });
    const codigos = m.P.ev('DB.socios.map(s=>s.codigoAcceso)');
    assert.deepEqual(lote.map(x => x.codigo), codigos, 'la primera vez el código va el mismo de siempre (llenar, no cambiar)');
    assert.deepEqual(Object.keys(huellas(m)).sort(), ['C0', 'C1', 'C2']);
    assert.equal(e.cinta.fase, 'al-dia');
    assert.equal(e.cinta.l1, 'Tus clientes ven lo de hace un momento');
    assert.equal(m.srv.ultimasCabeceras.apikey, 'llave-anon');
    /* Y otra vuelta sin cambios no manda nada. */
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(m.srv.lotes.length, 1, 'volvió a subir clientes que no cambiaron');
    sinAvisos(m);
  });

  test('un cambio en un cliente sube a ESE cliente, y sube solo tras los 90 s de calma', async () => {
    const m = montar({ n: 4 });
    await primera(m);
    m.P.ev('DB.socios[2].nombre = "Rosa Nueva"; guardar()');
    assert.ok(m.t.hay(90000), 'guardar() no armó el reloj de 90 s');
    assert.equal(cinta(m).fase, 'esperando');
    assert.match(cinta(m).l2, /tras 90 s sin cambios/);
    /* Un segundo guardar() reinicia el reloj: una operación larga sube al final. */
    m.P.ev('guardar()');
    assert.equal(m.t.cola.filter(x => x.ms === 90000).length, 1, 'quedaron dos relojes de 90 s');
    m.t.disparar(90000);
    await listo(m);
    assert.equal(m.srv.lotes.length, 2);
    assert.deepEqual(m.srv.lotes[1].map(x => x.nombre), ['Rosa Nueva']);
    assert.equal(cinta(m).fase, 'al-dia');
    sinAvisos(m);
  });

  test('un cobro sube al que pagó; las cifras del grupo de los demás esperan hasta 6 h', async () => {
    const m = montar({ n: 4, por: 1 });
    await primera(m);
    await cambiar(m, 'const p=DB.prestamos.find(x=>x.socioId==="C1"); p.pagado=true; p.fechaPagado="2026-10-06"');
    assert.equal(m.srv.lotes.length, 2);
    assert.deepEqual(m.srv.lotes[1].map(x => x.cedula), [cedulaDe(m, 'C1')], 'el cobro de uno subió a todos');
    const c = cinta(m);
    assert.equal(c.fase, 'al-dia');
    assert.match(c.l2, /las cifras del grupo se refrescan cada 6 h/, 'no dice que las cifras del grupo esperan');
    /* A las 5 h no; pasadas las 6 h, sí, y una sola vez. */
    m.reloj.avanzar(5 * 3600000);
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(m.srv.lotes.length, 2);
    m.reloj.avanzar(3600000 + 60000);
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(m.srv.lotes.length, 3);
    assert.deepEqual(m.srv.lotes[2].map(x => x.cedula).sort(), ['C0', 'C2', 'C3'].map(id => cedulaDe(m, id)).sort());
    const comunidad = m.P.ev('JSON.stringify(PUENTE.fotoComunidad(DB))');
    m.srv.lotes[2].forEach(x => assert.equal(JSON.stringify(x.datos.comunidad), comunidad));
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(m.srv.lotes.length, 3, 'las cifras del grupo se volvieron a subir sin cambiar');
    assert.doesNotMatch(cinta(m).l2, /cifras del grupo/);
  });

  test('un cliente sin celular ni cédula no sube, y la línea lo dice', async () => {
    const db = conCodigos(cartera(3, 0));
    db.socios[1].cedula = ''; db.socios[1].telefono = '';
    const m = montar({ db });
    await primera(m);
    assert.equal(m.srv.lotes[0].length, 2);
    assert.match(cinta(m).l2, /1 cliente sin celular ni cédula no sube/);
  });
});

/* ======================================================================== */
describe('la huella se escribe solo con el sí de la nube', () => {

  test('mientras la respuesta no llega, el cliente sigue pendiente', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const antes = huellas(m).C1;
    m.srv.modo = 'colgada';
    m.P.ev('DB.socios[1].nombre = "Luis Otro"; guardar()');
    m.t.disparar(90000);
    await tick();
    assert.equal(m.srv.colgadas.length, 1, 'no salió la llamada');
    assert.deepEqual(huellas(m).C1, antes, 'anotó la huella antes de que la nube contestara');
    assert.equal(cinta(m).fase, 'subiendo');
    assert.equal(cinta(m).l1, 'Subiendo 1 cliente…');
    m.srv.colgadas[0]();
    await listo(m);
    assert.notDeepEqual(huellas(m).C1, antes, 'la respuesta buena no anotó la huella');
    assert.equal(cinta(m).fase, 'al-dia');
  });

  test('si la nube falla, NO se anota, la línea lo dice, y sale otra vez en la vuelta siguiente', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const antes = JSON.stringify(huellas(m));
    m.srv.modo = '500';
    await cambiar(m, 'DB.socios[0].nombre = "Ana Dos"');
    assert.equal(JSON.stringify(huellas(m)), antes, 'una respuesta 500 anotó huellas');
    const c = cinta(m);
    assert.equal(c.fase, 'error');
    assert.equal(c.l1, 'No pude subir: 1 cliente con cambios esperando subir');
    assert.match(c.l2, /respondió 500/);
    assert.match(c.l2, /pruebo otra vez en 3 min/);
    assert.ok(m.t.hay(180000), 'no quedó programado el reintento');
    m.srv.modo = 'ok';
    m.t.disparar(180000);
    await listo(m);
    assert.equal(m.srv.lotes.length, 3);
    assert.deepEqual(m.srv.lotes[2].map(x => x.nombre), ['Ana Dos']);
    assert.equal(cinta(m).fase, 'al-dia');
    sinAvisos(m);
  });

  test('un corte a mitad deja subido lo que subió y pendiente el resto', async () => {
    const m = montar({ n: 60, por: 0 });
    m.srv.fallarDesde = 1;                     // la segunda llamada ya falla
    await primera(m);
    assert.equal(m.srv.lotes[0].length, 25);
    assert.equal(m.srv.lotes.length, 2, 'siguió mandando pedazos después del fallo');
    assert.equal(Object.keys(huellas(m)).length, 25, 'anotó huellas de pedazos que no subieron');
    assert.equal(cinta(m).l1, 'No pude subir: 35 clientes con cambios esperando subir');
    m.srv.fallarDesde = null;
    m.t.disparar(180000);
    await listo(m);
    assert.deepEqual(m.srv.lotes.slice(2).map(l => l.length), [25, 10], 'no retomó por donde iba');
    assert.equal(Object.keys(huellas(m)).length, 60);
  });

  test('sin internet: lo dice, no anota nada y vuelve a probar sola', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    const antes = JSON.stringify(huellas(m));
    m.srv.modo = 'sin-red';
    /* 7-oct (segunda vuelta): un fetch que falla con el navegador EN LÍNEA no
       es «sin internet» —puede ser la URL o la nube—, y se dice así. */
    await cambiar(m, 'DB.socios[1].nombre = "Sin Señal"');
    let c = cinta(m);
    assert.equal(c.fase, 'sin-llegar');
    assert.equal(c.l1, 'No pude llegar a la nube: 1 cliente con cambios esperando subir');
    assert.ok(m.t.hay(180000), 'un wifi que miente no dispara `online`: tiene que volver a probar sola');
    assert.equal(JSON.stringify(huellas(m)), antes, 'anotó lo que no llegó');
    /* El navegador que SÍ sabe que no hay red: ni siquiera llama, y ahí sí es
       «sin internet». */
    m.P.ctx.navigator.onLine = false;
    const n = m.srv.llamadas;
    await m.P.ev('HistorialesAuto.vuelta(true)');
    assert.equal(m.srv.llamadas, n);
    c = cinta(m);
    assert.equal(c.fase, 'sin-senal');
    assert.equal(c.l1, 'Sin internet: 1 cliente con cambios esperando subir');
    assert.match(c.l2, /suben solos cuando vuelva la señal/);
    m.P.ctx.navigator.onLine = true;
    m.srv.modo = 'ok';
    m.t.disparar(180000);
    await listo(m);
    assert.deepEqual(m.srv.lotes[m.srv.lotes.length - 1].map(x => x.nombre), ['Sin Señal']);
    sinAvisos(m);
  });
});

/* ======================================================================== */
describe('lo que falla se dice con UNA acción, sin preguntar ni gritar', () => {

  test('sin conexión configurada: no llama a nadie y manda a Ajustes', async () => {
    const m = montar({ n: 2, conexion: false });
    await primera(m);
    assert.equal(m.srv.llamadas, 0);
    const c = cinta(m);
    assert.equal(c.fase, 'sin-config');
    assert.equal(c.l1, 'Sin conexión a la nube: configúrala en Ajustes');
    assert.equal(c.clase, 'mal');
    assert.match(m.P.elems.historialesBarra.innerHTML, /Sin conexión a la nube: configúrala en Ajustes/);
    /* Joan pega la conexión y la guarda: prueba ya, sin esperar un cambio. */
    pegarConexion(m, CLAVE);
    m.P.ev('guardarSupabase()');
    m.t.disparar(1500);
    await listo(m);
    assert.equal(m.srv.lotes.length, 1);
    assert.equal(cinta(m).fase, 'al-dia');
  });

  test('una clave de menos de 12 no se manda (gastaría un intento del freno)', async () => {
    const m = montar({ n: 2, conexion: { clave: 'corta' } });
    await primera(m);
    assert.equal(m.srv.llamadas, 0);
    assert.equal(cinta(m).fase, 'sin-config');
    assert.match(cinta(m).l2, /12 caracteres o más/);
  });

  test('la clave equivocada no se reintenta en cada cambio: el freno de clave_ok es de todos', async () => {
    const m = montar({ n: 2 });
    m.srv.clave = 'la-clave-de-verdad-es-otra';
    await primera(m);
    assert.equal(m.srv.llamadas, 1);
    let c = cinta(m);
    assert.equal(c.fase, 'clave');
    assert.equal(c.l1, 'La nube no aceptó tu clave de sincronización');
    assert.match(c.l2, /Revísala en Ajustes/);
    assert.match(c.l2, /2 clientes con cambios esperando subir/);
    /* Cambios seguidos: ni una llamada más. */
    await cambiar(m, 'DB.socios[0].nombre = "Uno"');
    await cambiar(m, 'DB.socios[0].nombre = "Dos"');
    assert.equal(m.srv.llamadas, 1, 'cada cambio volvió a gastar un intento del freno global');
    assert.equal(cinta(m).fase, 'clave', 'un cambio tapó el aviso de la clave');
    /* Un corte de señal de por medio no borra la espera. */
    m.P.ctx.navigator.onLine = false;
    await cambiar(m, 'DB.socios[0].nombre = "Tres"');
    assert.equal(cinta(m).fase, 'sin-senal');
    m.P.ctx.navigator.onLine = true;
    await cambiar(m, 'DB.socios[0].nombre = "Cuatro"');
    assert.equal(m.srv.llamadas, 1, 'tras volver la señal gastó un intento antes de los 15 min');
    assert.equal(cinta(m).fase, 'clave');
    /* El reintento de «sin señal» llega antes de los 15 min: no gasta nada y
       deja puesto el reloj de lo que falta. */
    m.t.disparar(180000);
    await listo(m);
    assert.equal(m.srv.llamadas, 1);
    assert.ok(m.t.hay(15 * 60000), 'se perdió el reloj de los 15 min');
    /* Pasados 15 min, prueba sola una vez. */
    m.reloj.avanzar(15 * 60000);
    m.t.disparar(15 * 60000);
    await listo(m);
    assert.equal(m.srv.llamadas, 2);
    /* El clic en la línea lleva a Ajustes y NO prueba (7-oct, segunda vuelta):
       cada intento con la clave mala es uno de los 10 del freno global. */
    await m.P.ev('HistorialesAuto.accion()');
    assert.equal(m.srv.llamadas, 2);
    /* Y con la clave buena guardada, sube. */
    m.srv.clave = CLAVE;
    pegarConexion(m, CLAVE);
    m.P.ev('guardarSupabase()');
    m.t.disparar(1500);
    await listo(m);
    assert.equal(cinta(m).fase, 'al-dia');
    assert.equal(Object.keys(huellas(m)).length, 2);
  });

  test('«🔌 Probar conexión» con la clave ya arreglada en Supabase sube ya, sin esperar los 15 min', async () => {
    const m = montar({ n: 2 });
    m.srv.clave = 'la-de-supabase-era-otra';
    await primera(m);
    assert.equal(cinta(m).fase, 'clave');
    m.srv.clave = CLAVE;                         // Joan la corrige allá, no acá
    m.P.ev('probarSupabase()');
    for (let i = 0; i < 8; i++) await tick();
    assert.match(m.P.elems.sbEstado.innerHTML, /suben solos desde ya/);
    m.t.disparar(1500);
    await listo(m);
    assert.equal(cinta(m).fase, 'al-dia');
    assert.equal(Object.keys(huellas(m)).length, 2);
  });

  test('la llave anon mala y la función que falta se dicen con su arreglo', async () => {
    const m = montar({ n: 1 });
    m.srv.modo = '401';
    await primera(m);
    assert.equal(cinta(m).fase, 'llave');
    assert.equal(cinta(m).l1, 'La nube no aceptó la llave anon');
    m.srv.modo = '404';
    await m.P.ev('HistorialesAuto.vuelta(true)');
    assert.equal(cinta(m).fase, 'falta-funcion');
    assert.match(cinta(m).l2, /Corre base\/supabase\.sql/);
    assert.equal(Object.keys(huellas(m)).length, 0);
  });

  test('en todo el camino automático, ni un confirm() ni un alert()', async () => {
    const m = montar({ n: 3 });
    for (const modo of ['ok', '500', 'sin-red', '401', '404', 'ok']) {
      m.srv.modo = modo;
      await primera(m);
      await cambiar(m, 'DB.socios[0].nombre = "Vuelta ' + modo + '"');
      m.t.disparar(180000);
      await listo(m);
    }
    m.srv.clave = 'otra-clave-cualquiera-larga';
    await cambiar(m, 'DB.socios[1].nombre = "Clave mala"');
    sinAvisos(m);
    /* Y el código no tiene ninguno escrito. */
    assert.doesNotMatch(FUENTE.replace(/\/\*[\s\S]*?\*\//g, ''), /\b(alert|confirm|prompt)\s*\(/,
      'historiales-auto.js llama a alert/confirm/prompt');
  });
});

/* ======================================================================== */
describe('el PIN, el modo equipo, Joan ocupado y la otra pestaña', () => {

  test('antes del PIN no hace nada', async () => {
    const m = montar({ n: 2, entrar: false });
    assert.equal(m.P.ev('HistorialesAuto.configurado()'), false);
    m.P.ev('guardar()');
    assert.equal(m.t.hay(90000), false, 'guardar() armó la subida sin haber pasado el PIN');
    await m.P.ev('HistorialesAuto.vuelta(true)');
    assert.equal(m.srv.llamadas, 0);
  });

  test('en modo equipo se apaga y se queda apagado', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    const n = m.srv.llamadas;
    m.P.ev('CARTERA_EQUIPO = { yo: { nombre: "Gerente", rol: "gerente" }, gente: [] }');
    try { m.P.ev('modoEquipo()'); } catch (e) { /* el banco no pinta el modo equipo entero */ }
    assert.equal(cinta(m).fase, 'apagado');
    assert.equal(m.P.ev('HistorialesAuto.configurado()'), false);
    await m.P.ev('HistorialesAuto.vuelta(true)');
    const r = await m.P.ev('HistorialesAuto.subirTodo()');
    assert.equal(r.ok, false);
    assert.equal(m.srv.llamadas, n, 'subió la DB vacía del modo equipo');
  });

  test('quien entra como equipo no la enciende', async () => {
    const m = montar({ n: 2, entrar: false });
    m.P.ev('CARTERA_EQUIPO = { yo: { nombre: "Asesor", rol: "asesor" }, gente: [] }');
    entrar(m.P);
    assert.equal(m.P.ev('HistorialesAuto.configurado()'), false);
  });

  test('con Joan ocupado espera y vuelve a mirar; el clic no espera', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    m.P.ocupado = true;
    await cambiar(m, 'DB.socios[1].nombre = "Mientras Escribe"');
    assert.equal(m.srv.lotes.length, 1, 'subió con Joan escribiendo');
    assert.equal(cinta(m).fase, 'ocupado');
    assert.match(cinta(m).l2, /cuando termines lo que estás haciendo/);
    assert.ok(m.t.hay(15000));
    m.P.ocupado = false;
    m.t.disparar(15000);
    await listo(m);
    assert.equal(m.srv.lotes.length, 2);
    /* El clic sube aunque esté ocupado (está tocando la línea). */
    m.P.ocupado = true;
    m.P.ev('DB.socios[0].nombre = "Al Clic"; guardar()');
    await m.P.ev('HistorialesAuto.accion()');
    assert.deepEqual(m.srv.lotes[2].map(x => x.nombre), ['Al Clic']);
  });

  test('ocupado sin ningún cambio de por medio no inventa «cambios por subir»', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    m.P.ocupado = true;
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.equal(cinta(m).fase, 'al-dia');
  });

  test('si otra página escribió la cartera, no sube una DB vieja', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    const otra = JSON.parse(m.P.almacen[KEY]); otra.socios[0].nombre = 'Escrito por otra pestaña';
    m.P.almacen[KEY] = JSON.stringify(otra);
    const n = m.srv.llamadas;
    await m.P.ev('HistorialesAuto.vuelta(true)');
    assert.equal(m.srv.llamadas, n, 'subió los paquetes de una DB que ya no es la del disco');
    assert.equal(cinta(m).fase, 'sello-roto');
    assert.match(cinta(m).l1, /Otra página cambió tu cartera/);
    const r = await m.P.ev('HistorialesAuto.subirTodo()');
    assert.equal(r.ok, false);
    assert.equal(r.fase, 'sello-roto');
    assert.equal(m.srv.llamadas, n, 'el botón subió una DB vieja');
    /* El clic recarga y sube lo que de verdad hay. */
    await m.P.ev('HistorialesAuto.accion()');
    assert.ok(m.srv.lotes[m.srv.lotes.length - 1].some(x => x.nombre === 'Escrito por otra pestaña'));
  });

  test('si otra pestaña viva sube los historiales, esta le deja el turno; el clic lo pide para esta', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    const n = m.srv.llamadas;
    /* La otra pestaña guardó el MISMO texto (tiene el sello) y late en la llave
       de los historiales. Un guardar() de esta pestaña le devuelve el sello, así
       que después se vuelve a poner el de la otra. */
    m.P.ev('DB.socios[1].nombre = "Lo Sube La Otra"; guardar()');
    m.P.almacen[SELLO] = JSON.stringify(Object.assign({}, JSON.parse(m.P.almacen[SELLO]), { quien: 'OTRA' }));
    m.P.almacen[DUENO] = JSON.stringify({ id: 'OTRA', latido: m.reloj.now() });
    m.t.disparar(90000);
    await listo(m);
    assert.equal(cinta(m).fase, 'otra-pestana');
    assert.equal(cinta(m).l1, 'Los historiales los sube la otra pestaña del CRM');
    assert.equal(m.srv.llamadas, n);
    /* Si la otra se murió (su latido se apagó), esta sube sola —el texto del
       disco es el suyo— sin quitarle el sello de la cartera a nadie. */
    m.P.almacen[DUENO] = JSON.stringify({ id: 'OTRA', latido: m.reloj.now() - 10 * 60000 });
    await m.P.ev('HistorialesAuto.vuelta(false)');
    assert.deepEqual(m.srv.lotes[m.srv.lotes.length - 1].map(x => x.nombre), ['Lo Sube La Otra']);
    assert.equal(JSON.parse(m.P.almacen[DUENO]).id, m.P.ev('_TAB'), 'no tomó el turno de los historiales');
    assert.equal(JSON.parse(m.P.almacen[SELLO]).quien, 'OTRA', 'le quitó el sello de la cartera a otra pestaña sin que Joan lo pidiera');
    /* Con la otra viva otra vez, el clic en la línea lo pide para esta. */
    m.P.almacen[DUENO] = JSON.stringify({ id: 'OTRA', latido: m.reloj.now() });
    m.P.ev('DB.socios[0].nombre = "Al Clic"; guardar()');
    m.P.almacen[SELLO] = JSON.stringify(Object.assign({}, JSON.parse(m.P.almacen[SELLO]), { quien: 'OTRA' }));
    await m.P.ev('HistorialesAuto.vuelta(true)');
    assert.equal(cinta(m).fase, 'otra-pestana');
    await m.P.ev('HistorialesAuto.accion()');
    assert.deepEqual(m.srv.lotes[m.srv.lotes.length - 1].map(x => x.nombre), ['Al Clic']);
  });
});

/* ======================================================================== */
describe('el botón «☁ Subir historiales» sigue subiendo a todos', () => {

  test('sube a TODOS, con su código y su forzar, limpia la marca y deja las huellas puestas', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const nuevo = otroCodigo(99);
    m.P.ev('DB.socios[0].codigoAcceso=' + JSON.stringify(nuevo) + '; DB.socios[0].codigoForzar=true; guardar()');
    m.t.disparar(90000);
    await listo(m);
    const n = m.srv.lotes.length;
    m.P.ev('sincronizarSocios()');
    await listo(m); await tick(); await tick();
    assert.equal(m.P.ctx._preguntas.length, 1, 'el botón ya no pregunta antes de subir a todos');
    assert.equal(m.srv.lotes.length, n + 1);
    const lote = m.srv.lotes[n];
    assert.equal(lote.length, 3, 'el botón no subió a todos');
    const c0 = lote.find(x => x.cedula === cedulaDe(m, 'C0'));
    assert.equal(c0.codigo, nuevo);
    assert.equal(c0.codigo_forzar, true, 'el botón dejó de forzar el código regenerado');
    assert.equal(m.srv.filas[cedulaDe(m, 'C0')].codigo_hash, m.srv.huellaCodigo(nuevo));
    assert.equal(m.P.ev('DB.socios[0].codigoForzar'), undefined, 'la marca de forzar quedó puesta');
    assert.match(m.P.elems.sbEstado.textContent, /^Listo: 3 cliente\(s\) actualizados/);
    assert.match((m.P.ctx._avisos || []).join(''), /Historiales subidos/);
    /* Lo que el botón subió, la subida sola no lo repite. */
    m.t.disparar(90000);
    await listo(m);
    await m.P.ev('HistorialesAuto.vuelta(true)');
    assert.equal(m.srv.lotes.length, n + 1, 'la subida sola repitió lo que acababa de subir el botón');
    assert.equal(cinta(m).fase, 'al-dia');
  });

  test('con 60 clientes va en pedazos de 25; si se corta, limpia el forzar SOLO de los que subieron', async () => {
    const db = conCodigos(cartera(60, 0));
    db.socios[0].codigoForzar = true;
    db.socios[59].codigoForzar = true;
    const m = montar({ db, conexion: false });
    await primera(m);
    m.P.almacen['joan_socios_sb'] = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
    m.srv.fallarDesde = 2;
    m.P.ev('sincronizarSocios()');
    await listo(m); await tick(); await tick();
    assert.deepEqual(m.srv.lotes.map(l => l.length), [25, 25, 10]);
    assert.equal(m.P.ev('DB.socios[0].codigoForzar'), undefined);
    assert.equal(m.P.ev('DB.socios[59].codigoForzar'), true, 'se limpió la marca de uno que no alcanzó a subir');
    assert.match(m.P.elems.sbEstado.textContent, /alcanzaron 50 de 60/);
  });

  test('sin historiales-auto.js (un service worker viejo) el botón sigue por el camino de siempre', async () => {
    const m = montar({ n: 2, modulo: false });
    m.P.ev('sincronizarSocios()');
    await tick(); await tick(); await tick();
    assert.equal(m.srv.lotes.length, 1);
    assert.equal(m.srv.lotes[0].length, 2);
    assert.match(m.P.elems.sbEstado.textContent, /^Listo: 2 cliente\(s\)/);
  });
});

/* ======================================================================== */
describe('la subida sola no cambia ni genera el código de nadie', () => {

  test('un código REGENERADO no viaja solo: espera al botón, y la línea lo dice', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const viejo = m.srv.filas[cedulaDe(m, 'C1')].codigo_hash;
    const nuevo = otroCodigo(123);
    await cambiar(m, 'DB.socios[1].codigoAcceso=' + JSON.stringify(nuevo) + '; DB.socios[1].codigoForzar=true; DB.socios[1].nombre="Con Código Nuevo"');
    const item = m.srv.lotes[m.srv.lotes.length - 1].find(x => x.cedula === cedulaDe(m, 'C1'));
    assert.ok(item, 'el historial del regenerado no subió (su paquete sí cambió)');
    assert.equal(item.codigo, null, 'la subida sola mandó un código regenerado');
    assert.equal(item.codigo_forzar, false);
    assert.equal(m.srv.filas[cedulaDe(m, 'C1')].codigo_hash, viejo, 'la subida sola le cambió el código al cliente');
    assert.equal(m.srv.filas[cedulaDe(m, 'C1')].nombre, 'Con Código Nuevo');
    const c = cinta(m);
    assert.equal(c.clase, 'ojo');
    assert.match(c.l2, /1 código nuevo espera ☁ Subir historiales/);
  });

  test('un código distinto SIN forzar (un respaldo viejo importado) tampoco viaja', async () => {
    const m = montar({ n: 2 });
    await primera(m);
    const viejo = m.srv.filas[cedulaDe(m, 'C0')].codigo_hash;
    await cambiar(m, 'DB.socios[0].codigoAcceso=' + JSON.stringify(otroCodigo(5)) + '; DB.socios[0].nombre="Respaldo Viejo"');
    assert.equal(m.srv.filas[cedulaDe(m, 'C0')].codigo_hash, viejo);
    assert.equal(m.srv.lotes[m.srv.lotes.length - 1][0].codigo, null);
    assert.match(cinta(m).l2, /1 código nuevo espera/);
  });

  test('el código propio del cliente no se toca, y nunca sale un codigo_forzar:true', async () => {
    const m = montar({ n: 3 });
    await primera(m);
    const ced = cedulaDe(m, 'C2');
    m.srv.filas[ced].codigo_hash = 'H(PROPIO)'; m.srv.filas[ced].codigo_propio = true;
    for (let i = 0; i < 5; i++) await cambiar(m, 'DB.socios[2].nombre="Vuelta ' + i + '"');
    assert.equal(m.srv.filas[ced].codigo_hash, 'H(PROPIO)');
    m.srv.lotes.forEach(l => l.forEach(x => assert.equal(x.codigo_forzar, false)));
  });

  test('no genera códigos: el que no tiene sigue sin tener, y los demás quedan idénticos', async () => {
    const db = conCodigos(cartera(3, 1));
    db.socios[1].codigoAcceso = '';
    const m = montar({ db });
    const antes = m.P.ev('JSON.stringify(DB.socios.map(s=>[s.id,s.codigoAcceso,!!s.codigoForzar]))');
    await primera(m);
    for (let i = 0; i < 3; i++) await cambiar(m, 'DB.socios[' + i + '].nombre="Otro ' + i + '"');
    assert.equal(m.P.ev('JSON.stringify(DB.socios.map(s=>[s.id,s.codigoAcceso,!!s.codigoForzar]))'), antes,
      'la subida sola tocó un código en la cartera');
    assert.equal(m.srv.filas[cedulaDe(m, 'C1')].codigo_hash, null);
    m.srv.lotes.forEach(l => l.filter(x => x.cedula === cedulaDe(m, 'C1')).forEach(x => assert.equal(x.codigo, null)));
  });

  test('el PRIMER código de un cliente sí viaja: llenar un hueco no es cambiar una llave', async () => {
    const db = conCodigos(cartera(2, 0));
    db.socios[0].codigoAcceso = '';
    const m = montar({ db });
    await primera(m);
    assert.equal(m.srv.filas[cedulaDe(m, 'C0')].codigo_hash, null);
    const cod = otroCodigo(42);
    await cambiar(m, 'DB.socios[0].codigoAcceso=' + JSON.stringify(cod));
    assert.equal(m.srv.filas[cedulaDe(m, 'C0')].codigo_hash, m.srv.huellaCodigo(cod));
    assert.doesNotMatch(cinta(m).l2, /código nuevo espera/);
  });
});

/* ======================================================================== */
describe('300 clientes', () => {

  test('la primera vez, 12 llamadas de 25; después, un cobro es UNA llamada con UN cliente', async () => {
    const m = montar({ n: 300, por: 3 });
    const t0 = Date.now();
    await primera(m);
    const ms = Date.now() - t0;
    assert.equal(m.srv.lotes.length, 12);
    m.srv.lotes.forEach(l => assert.ok(l.length <= 25));
    assert.equal(m.srv.lotes.reduce((t, l) => t + l.length, 0), 300);
    const kb = Math.max(...m.srv.lotes.map(l => JSON.stringify(l).length)) / 1024;
    assert.ok(kb < 200, 'un pedazo pesa ' + kb.toFixed(0) + ' KB');
    /* Generoso a propósito (medido: ~0,3 s con 12 llamadas de mentira): lo que
       atrapa es volver a la cuenta cuadrática, que con 300 pasa de 2 s. */
    assert.ok(ms < 5000, 'la primera vuelta con 300 clientes tardó ' + ms + ' ms');
    await cambiar(m, 'const p=DB.prestamos.find(x=>x.socioId==="C150"); p.pagado=true; p.fechaPagado="2026-10-06"');
    assert.equal(m.srv.lotes.length, 13);
    assert.deepEqual(m.srv.lotes[12].map(x => x.cedula), [cedulaDe(m, 'C150')]);
    /* Una vuelta sin cambios con 300 clientes: armar y comparar, sin red. */
    const t1 = Date.now();
    await m.P.ev('HistorialesAuto.vuelta(false)');
    const ms2 = Date.now() - t1;
    assert.equal(m.srv.lotes.length, 13);
    assert.ok(ms2 < 2500, 'revisar 300 clientes sin cambios tardó ' + ms2 + ' ms');
    assert.ok(JSON.stringify(huellas(m)).length < 30000, 'las huellas de 300 clientes ya no son pequeñas');
  });

  test('el lote calcula las cifras del grupo UNA vez, no una por cliente', () => {
    const m = montar({ n: 30, por: 2, modulo: false });
    const P = m.P;
    const orig = { foto: PU.fotoComunidad, mig: PU.migrarSocio };
    let fotos = 0, conGrupo = 0, llamadas = 0;
    try {
      PU.fotoComunidad = function () { fotos++; return orig.foto.apply(this, arguments); };
      PU.migrarSocio = function (db, s, hasta, comunidad) { llamadas++; if (comunidad) conGrupo++; return orig.mig.apply(this, arguments); };
      const lote = P.ev('loteMigracion(true)');
      assert.equal(lote.length, 30);
      assert.equal(fotos, 1, 'fotoComunidad se calculó ' + fotos + ' veces para un lote');
      assert.equal(conGrupo, llamadas, 'algún paquete recalculó las cifras del grupo');
      lote.forEach(x => assert.equal(typeof x.socioId, 'string'));
      assert.equal(P.ev('loteMigracion()')[0].socioId, undefined, 'el id interno viaja en el lote del botón');
    } finally { PU.fotoComunidad = orig.foto; PU.migrarSocio = orig.mig; }
  });

  test('migrarSocio con las cifras del grupo ya calculadas da EXACTAMENTE lo mismo', () => {
    const db = PU.normalizar ? PU.normalizar(cartera(6, 2)) : cartera(6, 2);
    db.prestamos.forEach((p, i) => { if (i % 2) { p.pagado = true; p.fechaPagado = '2026-09-30'; } });
    const com = PU.fotoComunidad(db);
    db.socios.forEach(s => {
      assert.deepEqual(PU.migrarSocio(db, s, undefined, com), PU.migrarSocio(db, s));
    });
    const marca = { socios: -1 };
    assert.equal(PU.migrarSocio(db, db.socios[0], undefined, marca).comunidad, marca,
      'migrarSocio no usa las cifras que le pasan');
  });
});

/* ======================================================================== */
describe('lo que dice la línea de estado', () => {
  const H = crear({ almacen: { getItem: () => null, setItem() {}, removeItem() {} }, documento: null,
                    ahora: () => Date.parse('2026-10-07T15:00:00Z') });
  const t = H._puro.textoCinta;
  const base = { ahora: Date.parse('2026-10-07T15:00:00Z'), enLinea: true,
                 ultimaSubida: '2026-10-07T14:58:00Z', plan: { pendientes: 0, grupo: 0, retenidos: 0, total: 28, sinLlave: 0 } };
  const con = (x) => Object.assign({}, base, x, { plan: Object.assign({}, base.plan, x && x.plan) });

  test('al día de verdad: «Tus clientes ven lo de hace 2 min»', () => {
    const c = t(con({}));
    assert.equal(c.fase, 'al-dia');
    assert.equal(c.l1, 'Tus clientes ven lo de hace 2 min');
    assert.equal(c.l2, 'nada esperando subir');
    assert.equal(c.clase, 'calma');
    assert.equal(t(con({ ultimaSubida: '2026-10-05T10:00:00Z' })).l1, 'Tus clientes ven lo del 5-oct');
  });

  test('cada estado con lo que pasa y lo que hace el clic', () => {
    const casos = [
      [{ ultimo: { fase: 'sin-config' } }, 'sin-config', 'Sin conexión a la nube: configúrala en Ajustes'],
      [{ ultimo: { fase: 'clave' }, plan: { pendientes: 3 } }, 'clave', 'La nube no aceptó tu clave de sincronización'],
      [{ ultimo: { fase: 'llave' } }, 'llave', 'La nube no aceptó la llave anon'],
      [{ ultimo: { fase: 'falta-funcion' } }, 'falta-funcion', 'A la nube le falta la función de los historiales'],
      [{ ultimo: { fase: 'error', motivo: 'La nube respondió 500' }, plan: { pendientes: 2 } }, 'error', 'No pude subir: 2 clientes con cambios esperando subir'],
      [{ ultimo: { fase: 'sin-senal' }, plan: { pendientes: 4 } }, 'sin-senal', 'Sin internet: 4 clientes con cambios esperando subir'],
      [{ enLinea: false, plan: { pendientes: 1 } }, 'sin-senal', 'Sin internet: 1 cliente con cambios esperando subir'],
      [{ ultimo: { fase: 'sello-roto' } }, 'sello-roto', 'Otra página cambió tu cartera: desde esta pestaña no subo los historiales'],
      [{ ultimo: { fase: 'otra-pestana' } }, 'otra-pestana', 'Los historiales los sube la otra pestaña del CRM'],
      [{ enVuelta: true, subiendo: 7 }, 'subiendo', 'Subiendo 7 clientes…'],
      [{ ocupado: true, cambio: true }, 'ocupado', 'Hay cambios por subir'],
      [{ esperando: true, cambio: true }, 'esperando', 'Tus clientes ven lo de hace 2 min'],
      [{ plan: { pendientes: 5 } }, 'pendientes', '5 clientes con cambios esperando subir'],
      [{ plan: { total: 0 } }, 'nada', 'Todavía no hay clientes para subir']
    ];
    casos.forEach(([x, fase, l1]) => {
      const c = t(con(x));
      assert.equal(c.fase, fase, JSON.stringify(x));
      assert.equal(c.l1, l1, fase);
      assert.ok(c.l2 || fase === 'otra-pestana', fase + ' sin segundo renglón');
    });
  });

  test('nunca dice que está todo arriba si algo falló o espera', () => {
    const malos = [
      { ultimo: { fase: 'sin-config' } }, { ultimo: { fase: 'clave' } }, { ultimo: { fase: 'llave' } },
      { ultimo: { fase: 'falta-funcion' } }, { ultimo: { fase: 'error' } }, { ultimo: { fase: 'sin-senal' }, plan: { pendientes: 1 } },
      { ultimo: { fase: 'sello-roto' } }, { ocupado: true, cambio: true }, { esperando: true, cambio: true },
      { plan: { pendientes: 1 } }, { plan: { retenidos: 1 } }
    ];
    malos.forEach(x => {
      const c = t(con(x));
      assert.notEqual(c.clase, 'calma', JSON.stringify(x) + ' se pinta en calma');
      if (c.fase === 'al-dia') assert.match(c.l2, /código nuevo espera/);
    });
    /* La expresión «al día» no la usa ningún estado: «al día» no se puede afirmar
       sobre lo que ve el teléfono de otro. */
    [{}].concat(malos).forEach(x => {
      const c = t(con(x));
      assert.doesNotMatch(c.l1 + ' ' + c.l2, /al d[ií]a/i);
    });
  });

  test('el error del servidor se pinta escapado', () => {
    const c = t(con({ ultimo: { fase: 'error', motivo: '<img src=x onerror=alert(1)>' } }));
    assert.doesNotMatch(c.l2, /<img/);
  });
});

/* ======================================================================== */
describe('el plan, sin red', () => {
  const H = crear({ almacen: { getItem: () => null, setItem() {}, removeItem() {} }, documento: null,
                    normalizarCodigo: c => M.normalizarCodigoAcceso(c) });
  const plan = H._puro.planDeSubida;
  /* La cédula y el celular van en DÍGITOS, como los manda loteMigracion: el
     plan calcula la llave de la nube igual que sincronizar_socios, y '10a' y
     '10b' serían la misma llave '10' (dos fichas que chocan). */
  const item = (id, o) => Object.assign({ socioId: id, cedula: '10' + id.charCodeAt(0), telefono: '300' + id.charCodeAt(0), nombre: 'S' + id,
    codigo: 'K7M3Q', codigo_forzar: false, datos: { garantia: { total: 1 }, comunidad: { socios: 2 } } }, o);

  test('sin huellas, todos; con huellas iguales, nadie', () => {
    const p1 = plan([item('a'), item('b')], {});
    assert.equal(p1.enviar.length, 2);
    const regs = {}; p1.enviar.forEach(e => { regs[e.id] = e.rec; });
    assert.equal(plan([item('a'), item('b')], regs).enviar.length, 0);
  });

  test('solo las cifras del grupo: espera a las 6 h', () => {
    const p1 = plan([item('a')], {});
    const regs = { a: p1.enviar[0].rec };
    const otra = item('a', { datos: { garantia: { total: 1 }, comunidad: { socios: 3 } } });
    const ahora = Date.parse('2026-10-07T15:00:00Z');
    const p2 = plan([otra], regs, { ahora, grupoEn: '2026-10-07T12:00:00Z' });
    assert.equal(p2.propios.length, 0);
    assert.equal(p2.grupo.length, 1);
    assert.equal(p2.enviar.length, 0);
    assert.equal(plan([otra], regs, { ahora, grupoEn: '2026-10-07T08:59:00Z' }).enviar.length, 1);
  });

  test('la regla del código, caso por caso', () => {
    const p1 = plan([item('a')], {});
    const regs = { a: p1.enviar[0].rec };
    assert.equal(p1.enviar[0].item.codigo, 'K7M3Q', 'la primera vez el código va');
    const forzado = plan([item('a', { codigo: 'ZZ9ZZ', codigo_forzar: true })], regs);
    assert.equal(forzado.retenidos.length, 1);
    assert.equal(forzado.enviar.length, 0, 'un código regenerado, con el paquete igual, no es motivo para subir solo');
    const distinto = plan([item('a', { codigo: 'ZZ9ZZ', nombre: 'Otro' })], regs);
    assert.equal(distinto.enviar[0].item.codigo, null);
    assert.equal(distinto.enviar[0].rec.c, regs.a.c, 'anotaría como subido un código que no viajó');
    const manual = plan([item('a', { codigo: 'ZZ9ZZ', codigo_forzar: true })], regs, { manual: true });
    assert.equal(manual.enviar[0].item.codigo, 'ZZ9ZZ');
    assert.equal(manual.enviar[0].item.codigo_forzar, true);
    assert.equal(manual.retenidos.length, 0);
  });

  test('clasificar lo que contesta sincronizar_socios', () => {
    const k = H._puro.clasificar;
    assert.equal(k({ red: false }).fase, 'sin-senal');
    assert.deepEqual(k({ ok: true, status: 200, texto: '25' }), { fase: 'ok', aceptados: 25 });
    assert.equal(k({ ok: false, status: 400, texto: 'clave de sincronización incorrecta' }).fase, 'clave');
    assert.equal(k({ ok: false, status: 404, texto: 'no existe la clave' }).fase, 'falta-funcion');
    assert.equal(k({ ok: false, status: 401, texto: 'Invalid API key' }).fase, 'llave');
    assert.equal(k({ ok: false, status: 500, texto: 'x' }).fase, 'error');
  });

  test('nunca escribe la cartera', () => {
    assert.throws(() => H._puro.escribirTexto(KEY, '{}'), /no escribe nunca joan_socios_v1/);
    const fuera = FUENTE.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal((fuera.match(/\.setItem\(/g) || []).length, 1, 'hay un setItem fuera de escribirTexto');
  });
});

/* ======================================================================== */
describe('los enganches de crm.html y sw.js', () => {
  const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
  const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');

  test('el <script src> va después del bloque grande y de nube-crm.js, antes del service worker', () => {
    const i = CRM.indexOf('<script src="historiales-auto.js"></script>');
    assert.ok(i > CRM.indexOf('<script src="nube-crm.js"></script>'));
    assert.ok(i > CRM.indexOf('function entrar(){'));
    assert.ok(i < CRM.indexOf('navigator.serviceWorker.register'));
    assert.equal(CRM.split('<script src="historiales-auto.js"></script>').length - 1, 1);
    assert.match(CRM.slice(i, i + 900), /if\(!window\.HistorialesAuto\)\{ var b=document\.getElementById\('historialesBarra'\)/,
      'si el archivo no llega, Ajustes no lo dice');
    assert.match(CRM, /<div id="historialesBarra"><\/div>/);
  });

  test('se configura dentro de entrar(), nunca en modo equipo; modoEquipo y guardar la tocan', () => {
    const i = CRM.indexOf('function entrar(){');
    const cuerpo = CRM.slice(i, CRM.indexOf('\n  } else document.getElementById(\'pinErr\')', i));
    assert.match(cuerpo, /if\(window\.HistorialesAuto && !CARTERA_EQUIPO\) HistorialesAuto\.configurar\(/);
    const j = CRM.indexOf('function modoEquipo');
    assert.match(CRM.slice(j, j + 1200), /HistorialesAuto\.apagar\(\)/);
    const k = CRM.indexOf('function _trasGuardar(');
    assert.match(CRM.slice(k, CRM.indexOf('\n}', k)), /HistorialesAuto\.algoCambio\(\)/);
    const g = CRM.indexOf('function guardarSupabase(');
    assert.match(CRM.slice(g, CRM.indexOf('\n}', g)), /HistorialesAuto\.conexionCambio\(\)/);
  });

  test('sw.js precarga la pieza nueva y subió de número con nota', () => {
    assert.match(SW, /'panel\/historiales-auto\.js',/);
    const v = Number((/const CACHE = 'tugarantia-v(\d+)';/.exec(SW) || [])[1]);
    assert.ok(v >= 131, 'la caché sigue en v' + v + ': los computadores seguirían sin la subida sola');
    assert.match(SW, /\/\* v131 - 7-oct-2026\. LOS HISTORIALES DE LOS CLIENTES SUBEN SOLOS/);
  });
});
