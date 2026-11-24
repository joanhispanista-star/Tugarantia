/* ============================================================================
 * QUÉ PLATAFORMAS USA — 24 de noviembre de 2026
 *
 *   node --test pruebas/las-plataformas-del-extracto.test.js
 *
 * Joan, el 24-nov: «que el cliente pueda indicar que plataformas usa como
 * nequi, daviplata, nubank, lulo bank u otros… para poder dar con un analisis
 * de riesgo mucho mas acertado… todo esto opcional».
 *
 * Lo que aquí se cuida, en el orden en que le pasa a la persona:
 *   1 · la lista es CERRADA y es la misma en el teléfono, en el CRM y en la base;
 *   2 · las casillas solo salen con la autorización aparte de los extractos;
 *   3 · en el registro esperan en el teléfono y suben con la cola: después de
 *       la autorización, antes de los archivos, y sin tumbar los archivos si la
 *       base todavía no las guarda;
 *   4 · en la cuenta se leen y se guardan con SU sesión, y la pantalla no dice
 *       «marcado» de lo que no quedó;
 *   5 · Joan las ve en el CRM, y si no se pudieron preguntar, se dice;
 *   6 · el SQL, hasta donde se puede leyéndolo (no hay PostgreSQL a mano: su
 *       «prueba llamando» corre sola cuando Joan lo pega en Supabase);
 *   7 · la política y la ficha de cumplimiento lo declaran.
 * Los celulares y los nombres son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const EX = require('../app/extractos.js');
const XC = require('../panel/extractos-crm.js');
const B = require('./banco-registro.js');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const SQL_NOMBRE = 'base/20261124_plataformas_del_extracto.sql';
const SQL = leer(SQL_NOMBRE);
const CODIGO = SQL.replace(/--[^\n]*/g, '');
const IDS = ['nequi', 'daviplata', 'nubank', 'lulo', 'bancolombia', 'otra'];
const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
const PDF64 = Buffer.from('%PDF-1.4\n% extracto de mentira\n%%EOF\n', 'binary').toString('base64');
const UN_PDF = { tipo: 'pdf', bytes: 38, base64: PDF64, sha256: 'x1' };
const CEL = '3001112233';
const marcadas = h => [...String(h).matchAll(/data-ex="plat" value="([a-z]+)"( checked)?/g)].filter(m => m[2]).map(m => m[1]);
const casillas = h => [...String(h).matchAll(/data-ex="plat" value="([a-z]+)"/g)].map(m => m[1]);

/* Una caja de mentira: guarda lo pintado y los oyentes, como el navegador. */
function caja() {
  return { innerHTML: '', _oyentes: {}, ownerDocument: null,
    addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
    contains() { return true; } };
}
const cambio = (c, que, o) => c._oyentes.change[c._oyentes.change.length - 1]({ target: Object.assign({ getAttribute: k => (k === 'data-ex' ? que : null) }, o) });

/* ======================================================================== */
describe('1 · la lista es cerrada, y es la misma en el teléfono, en el CRM y en la base', () => {
  test('los seis de la lista, en su orden; el teléfono y el CRM los llaman igual', () => {
    assert.deepEqual(EX.PLATAFORMAS.map(p => p.id), IDS);
    assert.deepEqual(XC.PLATAFORMAS, EX.PLATAFORMAS, 'el CRM y el teléfono no tienen la misma lista');
    ['Nequi', 'Daviplata', 'Nubank', 'Lulo Bank'].forEach(n =>
      assert.ok(EX.PLATAFORMAS.some(p => p.nombre === n), 'falta «' + n + '», que Joan nombró'));
  });
  test('la base guarda exactamente esa lista, en ese orden (extracto_plataformas_limpia)', () => {
    const m = /unnest\(array\[([^\]]+)\]\)/.exec(CODIGO);
    assert.ok(m, 'no encuentro la lista en el SQL');
    assert.deepEqual(m[1].split(',').map(x => x.trim().replace(/'/g, '')), IDS);
  });
  test('limpiar: solo lo de la lista, en el orden de la lista, sin repetir; texto con comas o lista', () => {
    assert.deepEqual(EX.limpiarPlataformas(' LULO, Nequi,otra,nequi,bitcoin,<script>'), ['nequi', 'lulo', 'otra']);
    assert.deepEqual(EX.limpiarPlataformas(['otra', 'daviplata', 'daviplata', null, 7]), ['daviplata', 'otra']);
    [undefined, null, '', [], 'mi banco de siempre', {}].forEach(v => assert.deepEqual(EX.limpiarPlataformas(v), []));
  });
  test('en palabras, para la persona y para Joan; lo que no es de la lista no sale', () => {
    assert.equal(EX.plataformasEnPalabras('nequi'), 'Nequi');
    assert.equal(EX.plataformasEnPalabras('lulo,nequi'), 'Nequi y Lulo Bank');
    assert.equal(EX.plataformasEnPalabras(['otra', 'daviplata', 'nequi']), 'Nequi, Daviplata y Otro banco');
    assert.equal(EX.plataformasEnPalabras(''), '');
    assert.equal(XC.plataformasEnPalabras('nequi,lulo,<b>x</b>'), 'Nequi y Lulo Bank');
    assert.equal(XC.plataformasEnPalabras(null), '');
  });
  test('alternar pone o quita UNA, y deja la lista en su orden', () => {
    assert.deepEqual(EX.alternarPlataforma([], 'lulo', true), ['lulo']);
    assert.deepEqual(EX.alternarPlataforma(['lulo'], 'nequi', true), ['nequi', 'lulo']);
    assert.deepEqual(EX.alternarPlataforma(['nequi', 'lulo'], 'nequi', false), ['lulo']);
    assert.deepEqual(EX.alternarPlataforma(['lulo'], 'bitcoin', true), ['lulo'], 'entró una que no es de la lista');
  });
});

/* ======================================================================== */
describe('2 · las casillas solo salen con la autorización aparte', () => {
  const vm = o => Object.assign({ modo: 'registro', aut: null, archivos: [], plataformas: [] }, o);
  const AUT = { version: EX.VERSION_AUTORIZACION };
  test('sin la autorización, ninguna; con ella, las seis, SIN marcar, después de la casilla y antes de los botones de subir', () => {
    assert.deepEqual(casillas(EX.pantallaHTML(vm())), [], 'se pregunta por sus plataformas sin autorización');
    const h = EX.pantallaHTML(vm({ aut: AUT }));
    assert.deepEqual(casillas(h), IDS);
    assert.deepEqual(marcadas(h), [], 'alguna nació marcada');
    assert.ok(h.indexOf('id="exAut"') < h.indexOf('id="exPlataformas"'), 'van antes de la autorización');
    assert.ok(h.indexOf('id="exPlataformas"') < h.indexOf('id="exBotonPdf"'), 'van después de los botones de subir');
    assert.match(plano(h), /¿Cuáles usas\? Marca dónde te llega o mueves tu plata\. Opcional\./);
  });
  test('las que ya marcó salen marcadas; son casillas de verdad (teclado y lector), sin sitio para escribir', () => {
    const h = EX.plataformasHTML(vm({ aut: AUT, plataformas: ['lulo', 'nequi'] }));
    assert.deepEqual(marcadas(h), ['nequi', 'lulo']);
    assert.equal((h.match(/<input type="checkbox" data-ex="plat"/g) || []).length, 6);
    assert.equal(/type="text"|<textarea|<select/.test(h), false, 'hay dónde escribir texto libre');
    assert.match(h, /role="group" aria-labelledby="exPlatTitulo"/);
  });
  test('si la base todavía no las guarda, o no se pudo leer cuáles tenía, no se pintan', () => {
    assert.equal(EX.plataformasHTML(vm({ aut: AUT, sinPlataformas: true })), '');
    assert.equal(EX.plataformasHTML(vm({ aut: AUT, plataformasSinLeer: true })), '');
  });
  test('la autorización que se firma lo dice, y no pide ninguna clave', () => {
    assert.match(EX.TEXTOS.autorizacionDetalle, /También guardan cuáles plataformas marco que uso \(Nequi, Daviplata, bancos\), para lo mismo\./);
    assert.match(EX.TEXTOS.autorizacionDetalle, /Nunca me piden la clave/);
  });
  test('el estilo: 44 px para el dedo, y la marcada se distingue por algo más que el color', () => {
    const js = leer('app/extractos.js');
    assert.match(js, /\.ex-chip span\{[^}]*min-height:44px/);
    assert.match(js, /\.ex-chip input:checked\+span::before\{content:"✓"/);
    assert.match(js, /\.ex-chip input:focus-visible\+span\{outline:/);
  });
});

/* ======================================================================== */
describe('3 · en el registro: esperan en el teléfono y suben con la cola', () => {
  function paso(o) {
    const g = EX.guardadero({}), c = caja();
    const ctl = EX.pasoDelRegistro(c, Object.assign({ guardadero: g, intento: 'i1', celular: CEL }, o));
    return { g, c, ctl };
  }
  test('marcar la autorización las muestra; cada toque queda guardado con lo escogido; quitar la autorización las borra', async () => {
    const { g, c } = paso();
    await asentar(5);
    assert.deepEqual(casillas(c.innerHTML), []);
    cambio(c, 'aut', { checked: true });
    await asentar(5);
    assert.deepEqual(casillas(c.innerHTML), IDS);
    cambio(c, 'plat', { value: 'lulo', checked: true });
    cambio(c, 'plat', { value: 'nequi', checked: true });
    await asentar(5);
    assert.deepEqual(g.estado('i1', CEL).plataformas, ['nequi', 'lulo']);
    cambio(c, 'plat', { value: 'lulo', checked: false });
    await asentar(5);
    assert.deepEqual(g.estado('i1', CEL).plataformas, ['nequi']);
    /* Al volver al paso (la pestaña que se cerró al ir al banco), siguen marcadas. */
    const c2 = caja();
    EX.pasoDelRegistro(c2, { guardadero: g, intento: 'i1', celular: CEL });
    await asentar(5);
    assert.deepEqual(marcadas(c2.innerHTML), ['nequi']);
    cambio(c2, 'aut', { checked: false });
    await asentar(5);
    assert.deepEqual(g.estado('i1', CEL).plataformas, [], 'quitó la autorización y sus plataformas se quedaron');
    assert.deepEqual(casillas(c2.innerHTML), []);
    /* Y si la vuelve a marcar en la misma pantalla, nacen en blanco: la pantalla
       no puede mostrar marcada una que ya no está guardada. */
    cambio(c2, 'aut', { checked: true });
    await asentar(5);
    assert.deepEqual(casillas(c2.innerHTML), IDS);
    assert.deepEqual(marcadas(c2.innerHTML), [], 'volvió a autorizar y le salieron marcadas las que ya se habían borrado');
    assert.deepEqual(g.estado('i1', CEL).plataformas, []);
  });
  test('sin autorización, un toque suelto no guarda nada', async () => {
    const { g, c } = paso();
    await asentar(5);
    cambio(c, 'plat', { value: 'nequi', checked: true });
    await asentar(5);
    assert.deepEqual(g.estado('i1', CEL).plataformas || [], []);
  });
  test('si la página supo que la base no las guarda (404), se quitan las casillas y lo marcado; el paso sigue', async () => {
    const { g, c, ctl } = paso();
    await asentar(5);
    cambio(c, 'aut', { checked: true });
    cambio(c, 'plat', { value: 'nequi', checked: true });
    await asentar(5);
    ctl.sinPlataformas();
    assert.deepEqual(casillas(c.innerHTML), []);
    assert.deepEqual(g.estado('i1', CEL).plataformas, []);
    assert.match(c.innerHTML, /id="exBotonPdf"/, 'se llevó también los botones de subir');
    /* Y un paso que nace sabiéndolo, no las ofrece. */
    const otro = paso({ sinPlataformas: true });
    await asentar(5);
    cambio(otro.c, 'aut', { checked: true });
    await asentar(5);
    assert.deepEqual(casillas(otro.c.innerHTML), []);
  });

  /* La cola, con una nube de mentira que anota el orden. */
  async function colaCon(plataformas, archivos) {
    const g = EX.guardadero({});
    const e = g.estado('i1', CEL);
    e.aut = EX.armarAutorizacion('2026-11-24T15:00:00Z'); e.plataformas = plataformas;
    g.guardarEstado(e);
    for (const a of (archivos || [])) await g.agregar('i1', CEL, a);
    assert.equal(await g.encolar('i1', CEL), true);
    return g;
  }
  function nube(o) {
    const l = [];
    const llamar = (fn, cuerpo) => {
      l.push({ fn, cuerpo });
      const r = (o || {})[fn];
      if (r && r.rechaza) return Promise.reject(r.rechaza);
      return Promise.resolve(r || { ok: true });
    };
    return { l, llamar, orden: () => l.map(x => x.fn) };
  }
  test('la cola las lleva, y suben DESPUÉS de la autorización y ANTES de los archivos, la lista entera', async () => {
    const g = await colaCon(['lulo', 'nequi'], [UN_PDF]);
    assert.deepEqual((await g.cola(CEL)).plataformas, ['nequi', 'lulo']);
    const N = nube();
    const r = await EX.subirCola(g, CEL, N.llamar);
    assert.deepEqual(N.orden(), ['extracto_autorizar', 'extracto_plataformas', 'extracto_subir']);
    assert.deepEqual(N.l[1].cuerpo, { p_plataformas: 'nequi,lulo' });
    assert.equal(r.estado, 'ok');
    assert.equal(r.subidos, 1);
    assert.equal(await g.cola(CEL), null, 'la cola no se vació');
  });
  test('ESPERAN a que la autorización termine de entrar: no salen mientras la base todavía no la tiene', async () => {
    const g = await colaCon(['nequi'], [UN_PDF]);
    const pasos = [];
    let soltar = null;
    const llamar = (fn) => {
      pasos.push('sale ' + fn);
      if (fn === 'extracto_autorizar') return new Promise(res => { soltar = () => { pasos.push('entra extracto_autorizar'); res({ ok: true }); }; });
      return Promise.resolve({ ok: true });
    };
    const p = EX.subirCola(g, CEL, llamar);
    await asentar(10);
    assert.deepEqual(pasos, ['sale extracto_autorizar'], 'algo salió sin esperar a la autorización');
    soltar();
    await p;
    assert.deepEqual(pasos, ['sale extracto_autorizar', 'entra extracto_autorizar', 'sale extracto_plataformas', 'sale extracto_subir']);
  });
  test('quien no marcó ninguna no hace esa llamada: todo sigue como antes', async () => {
    const g = await colaCon([], [UN_PDF]);
    const N = nube();
    await EX.subirCola(g, CEL, N.llamar);
    assert.deepEqual(N.orden(), ['extracto_autorizar', 'extracto_subir']);
  });
  test('con la base sin ese SQL (404), los archivos suben igual', async () => {
    const g = await colaCon(['nequi'], [UN_PDF]);
    const N = nube({ extracto_plataformas: { rechaza: { status: 404 } } });
    const r = await EX.subirCola(g, CEL, N.llamar);
    assert.deepEqual(N.orden(), ['extracto_autorizar', 'extracto_plataformas', 'extracto_subir']);
    assert.equal(r.estado, 'ok');
    assert.equal(r.subidos, 1);
    assert.equal(r.plataformas, 'apagado');
  });
  test('cualquier otro fallo NO se traga: la cola se queda entera y el reintento no repite lo que ya entró', async () => {
    const g = await colaCon(['nequi'], [UN_PDF]);
    const N = nube({ extracto_plataformas: { rechaza: { status: 500 } } });
    const r = await EX.subirCola(g, CEL, N.llamar);
    assert.equal(r.estado, 'sin_red');
    assert.equal(r.pendientes, 1);
    assert.deepEqual(N.orden(), ['extracto_autorizar', 'extracto_plataformas'], 'subió archivos con las plataformas sin guardar');
    const c = await g.cola(CEL);
    assert.ok(c && c.autorizada === true && !c.plataformasDichas && c.archivos.length === 1);
    /* Al volver: la autorización ya entró y no se repite; las plataformas sí. */
    const N2 = nube();
    const r2 = await EX.subirCola(g, CEL, N2.llamar);
    assert.deepEqual(N2.orden(), ['extracto_plataformas', 'extracto_subir']);
    assert.equal(r2.estado, 'ok');
  });
  test('si la base dice que la autorización ya no está, se trata como retirada (y la cola se va)', async () => {
    const g = await colaCon(['nequi'], [UN_PDF]);
    const N = nube({ extracto_plataformas: { ok: false, motivo: 'sin_autorizacion' } });
    const r = await EX.subirCola(g, CEL, N.llamar);
    assert.equal(r.estado, 'retirada');
    assert.equal(await g.cola(CEL), null);
  });

  /* En la página de verdad (play/). */
  function mariaEnElPaso() {
    const P = B.abrir();
    P.ev('Object.assign(REGISTRO, ' + JSON.stringify(Object.assign({ celular: B.CEL_MARIA }, B.DATOS_MARIA, B.CONTACTO_MARIA, B.RESTO,
      { ocupacion: 'Empleado' })) + '); guardarBorrador(REGISTRO);');
    P.ev('anotarCelularDelRegistro(' + JSON.stringify(B.CEL_MARIA) + ')');
    return P;
  }
  const escoger = (P, plataformas) => P.ev('(function () { var g = guardaderoExtractos(); var e = g.estado(REGISTRO.intento, REGISTRO.celular);' +
    ' e.aut = EX.armarAutorizacion(new Date().toISOString()); e.plataformas = ' + JSON.stringify(plataformas) + '; g.guardarEstado(e); })()');
  const exCaja = P => P.ev("(document.getElementById('exPaso') || {}).innerHTML || ''");
  test('play/: a una empleada, con la autorización, el paso le pinta las casillas con las suyas marcadas', async () => {
    const P = mariaEnElPaso();
    B.nube(P);
    P.ev("pintarRegistro(indiceDe('ingresos')); pintarRegistro(indiceDe('extractos'))");
    await asentar(10);
    assert.equal(B.pasoActual(P), 'extractos');
    assert.deepEqual(casillas(exCaja(P)), [], 'antes de autorizar ya pregunta');
    escoger(P, ['daviplata']);
    P.ev("pintarRegistro(indiceDe('extractos'))");
    await asentar(10);
    assert.deepEqual(casillas(exCaja(P)), IDS);
    assert.deepEqual(marcadas(exCaja(P)), ['daviplata']);
  });
  test('play/: pregunta a la base si las guarda; un 404 quita SOLO las casillas, no el paso', async () => {
    const P = mariaEnElPaso();
    const llamadas = B.nube(P);
    P.ev("(function () { var f = fetch; fetch = function (u, op) { if (/rpc\\/extracto_plataformas_mias/.test(String(u))) {" +
      " window.__llamadas.push({ url: String(u), auth: String(op.headers.Authorization) }); return Promise.resolve({ ok: false, status: 404," +
      " json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve('{}'); } }); } return f(u, op); }; })()");
    P.ev("pintarRegistro(indiceDe('ingresos')); pintarRegistro(indiceDe('extractos'))");
    escoger(P, ['nequi']);
    P.ev("pintarRegistro(indiceDe('extractos'))");
    await asentar(20);
    const q = llamadas().filter(x => /rpc\/extracto_plataformas_mias/.test(x.url));
    assert.equal(q.length, 1, 'la pregunta se hace una vez por visita');
    assert.equal(B.pasoActual(P), 'extractos', 'el 404 de las plataformas se llevó el paso entero');
    assert.equal(P.ev('EX_SIN_PLATAFORMAS'), true);
    assert.equal(P.ev('EX_APAGADO_PLAY'), false);
    assert.deepEqual(casillas(exCaja(P)), []);
    assert.match(exCaja(P), /id="exBotonPdf"/);
    assert.deepEqual(P.ev('guardaderoExtractos().estado(REGISTRO.intento, REGISTRO.celular).plataformas'), []);
  });
  test('play/: «Abrir mi cuenta» las sube con la sesión de la cuenta nueva, entre la autorización y el archivo', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    P.ev("REGISTRO.ocupacion = 'Empleado'; guardarBorrador(REGISTRO); pintarRegistro(indiceDe('permiso'));" +
         " $('autGeneral').checked = true; $('autSensible').checked = false;");
    escoger(P, ['nequi', 'nubank']);
    P.ev('guardaderoExtractos().agregar(REGISTRO.intento, REGISTRO.celular, ' + JSON.stringify(UN_PDF) + ')');
    await asentar(5);
    B.tocar(P, 'Abrir mi cuenta');
    await asentar(40);
    assert.equal(P.ev('VISTA'), 'listo', 'no abrió su cuenta: ' + B.texto(B.caja(P)));
    const l = llamadas();
    const i = f => l.findIndex(x => new RegExp('rpc/' + f + '$').test(x.url));
    assert.ok(i('extracto_plataformas') > i('extracto_autorizar') && i('extracto_autorizar') >= 0, 'salieron antes de la autorización');
    assert.ok(i('extracto_plataformas') < i('extracto_subir'), 'salieron después del archivo');
    const p = l[i('extracto_plataformas')];
    assert.deepEqual(p.cuerpo, { p_plataformas: 'nequi,nubank' });
    assert.match(p.auth, /^Bearer tok-573001112233@tugarantia\.net-/, 'no salieron con la sesión de la cuenta nueva');
    /* Y no viajan en el registro ni en el signup: solo por su función. */
    const signup = l.find(x => /auth\/v1\/signup/.test(x.url));
    assert.equal(/plataformas|nubank/.test(JSON.stringify(signup.cuerpo)), false, 'viajaron en el signup');
  });
});

/* ======================================================================== */
describe('4 · en la cuenta: con SU sesión, y sin decir «marcado» de lo que no quedó', () => {
  const AHORA = Date.parse('2026-11-24T15:00:00Z');
  const SESION = JSON.stringify({ access_token: 'token-de-ana', refresh_token: 'r', expira_en: AHORA + 3600000, celular: '3001112222' });
  function nube(o) {
    o = o || {};
    const AUT = { version: EX.VERSION_AUTORIZACION, recibida_en: '2026-11-24T15:00:00Z', revocada_en: null };
    const mia = { ok: true, ocupacion: 'Empleado', autorizacion: o.sinAutorizar ? null : AUT, archivos: [] };
    const est = { plataformas: o.plataformas || '' };
    const f = (url, cuerpo) => {
      if (/rpc\/mi_cuenta$/.test(url)) return { status: 200, cuerpo: { ok: true, vinculada: false } };
      if (/rpc\/mi_registro$/.test(url)) return { status: 200, cuerpo: { ok: true, registro: { estado: 'nuevo', creado_en: '2026-11-24T14:55:00Z' } } };
      if (/rpc\/chat_/.test(url)) return { status: 200, cuerpo: { ok: true, mensajes: [], servicio: 0, cobranza: 0, creditos: 0, total: 0 } };
      if (/rpc\/pension_mia$/.test(url)) return { status: 200, cuerpo: { ok: true, autorizacion: null, archivos: [] } };
      if (/rpc\/extracto_mia$/.test(url)) return { status: 200, cuerpo: mia };
      if (/rpc\/extracto_autorizar$/.test(url)) { mia.autorizacion = AUT; return { status: 200, cuerpo: { ok: true } }; }
      if (/rpc\/extracto_subir$/.test(url)) {
        mia.archivos.push({ id: 900 + mia.archivos.length, tipo: 'pdf', bytes: 38, creado_en: '2026-11-24T15:01:00Z' });
        return { status: 200, cuerpo: { ok: true, id: 900, tipo: 'pdf', bytes: 38 } };
      }
      if (/rpc\/extracto_plataformas_mias$/.test(url)) {
        if (o.sinSql) return { status: 404, cuerpo: {} };
        if (o.leerFalla) return { status: 500, cuerpo: {} };
        return { status: 200, cuerpo: { ok: true, plataformas: est.plataformas } };
      }
      if (/rpc\/extracto_plataformas$/.test(url)) {
        if (o.guardarFalla) return { status: 500, cuerpo: {} };
        est.plataformas = cuerpo.p_plataformas;
        return { status: 200, cuerpo: { ok: true, plataformas: est.plataformas } };
      }
      return { status: 404, cuerpo: {} };
    };
    f.est = est;
    return f;
  }
  const de = (A, fn) => A.llamadas.filter(l => new RegExp('rpc/' + fn + '$').test(l.url));
  async function abierta(red) {
    const A = abrirSocio({ local: { socio_cuenta: SESION }, ahora: AHORA, red });
    await asentar(30);
    A.elem('exAbrir')._oyentes.click[0]();
    await asentar(10);
    return A;
  }
  const cuerpo = A => A.elem('exCuerpo').innerHTML;
  const ultimo = A => { const l = A.elem('exCuerpo')._oyentes.change; return l[l.length - 1]; };
  const tocarPlat = (A, id, si) => ultimo(A)({ target: { getAttribute: k => (k === 'data-ex' ? 'plat' : null), value: id, checked: si } });

  test('a quien ya autorizó: las casillas con las suyas marcadas, leídas con SU sesión', async () => {
    const A = await abierta(nube({ plataformas: 'nequi,lulo' }));
    assert.deepEqual(casillas(cuerpo(A)), IDS);
    assert.deepEqual(marcadas(cuerpo(A)), ['nequi', 'lulo']);
    assert.equal(de(A, 'extracto_plataformas_mias')[0].cab.Authorization, 'Bearer token-de-ana');
  });
  test('cada toque manda la lista ENTERA con su sesión, y queda en la base', async () => {
    const red = nube({ plataformas: 'nequi' });
    const A = await abierta(red);
    tocarPlat(A, 'daviplata', true);
    tocarPlat(A, 'nequi', false);
    await asentar(20);
    const g = de(A, 'extracto_plataformas');
    assert.deepEqual(g.map(x => x.cuerpo.p_plataformas), ['nequi,daviplata', 'daviplata']);
    assert.equal(g[0].cab.Authorization, 'Bearer token-de-ana');
    assert.equal(red.est.plataformas, 'daviplata');
  });
  test('se leen UNA vez por autorización: subir un archivo no las vuelve a pedir', async () => {
    const A = await abierta(nube({ plataformas: 'nequi' }));
    const pdf = new Blob([Buffer.from('%PDF-1.4\n% extracto de mentira\n%%EOF\n', 'binary')]);
    ultimo(A)({ target: { getAttribute: k => (k === 'data-ex' ? 'archivo' : null), files: [pdf] } });
    await asentar(40);
    assert.ok(de(A, 'extracto_subir').length === 1, 'la prueba no subió el archivo');
    assert.equal(de(A, 'extracto_plataformas_mias').length, 1);
    assert.deepEqual(marcadas(cuerpo(A)), ['nequi'], 'al repintar se perdió la marcada');
  });
  test('sin autorización no se piden ni se pintan; al marcarla, aparecen', async () => {
    const A = await abierta(nube({ sinAutorizar: true }));
    assert.equal(de(A, 'extracto_plataformas_mias').length, 0, 'las pidió sin autorización');
    assert.deepEqual(casillas(cuerpo(A)), []);
    ultimo(A)({ target: { getAttribute: k => (k === 'data-ex' ? 'aut' : null), checked: true } });
    await asentar(30);
    assert.deepEqual(casillas(cuerpo(A)), IDS);
    assert.deepEqual(marcadas(cuerpo(A)), []);
  });
  test('con la base sin ese SQL (404), la tarjeta sigue y las casillas no aparecen', async () => {
    const A = await abierta(nube({ sinSql: true }));
    assert.deepEqual(casillas(cuerpo(A)), []);
    assert.match(cuerpo(A), /id="exBotonPdf"/, 'el 404 de las plataformas se llevó la tarjeta');
  });
  test('si no se pudo leer cuáles tenía, no se pintan en blanco (un toque borraría las que no se ven)', async () => {
    const A = await abierta(nube({ leerFalla: true, plataformas: 'nequi' }));
    assert.deepEqual(casillas(cuerpo(A)), []);
    assert.match(cuerpo(A), /id="exBotonPdf"/);
  });
  test('si guardar falla, la casilla vuelve a lo último que sí quedó, y se dice', async () => {
    const red = nube({ plataformas: 'nequi', guardarFalla: true });
    const A = await abierta(red);
    tocarPlat(A, 'lulo', true);
    await asentar(20);
    assert.deepEqual(marcadas(cuerpo(A)), ['nequi'], 'la pantalla dice «marcado» de algo que no quedó');
    assert.match(plano(cuerpo(A)), /No hay conexión\. Revisa tu internet y vuelve a intentar\./);
    assert.equal(red.est.plataformas, 'nequi');
  });
});

/* ======================================================================== */
describe('5 · Joan las ve en el CRM, con su clave', () => {
  const CLAVE = 'clave-de-prueba-larga-123';
  const AUT = { version: '2026-11-24', autorizada_en: '2026-11-24T15:00:00Z', revocada_en: null };
  function rpcDe(o) {
    const l = [];
    const rpc = (fn, c) => {
      l.push({ fn, c });
      const r = o[fn];
      if (r === undefined) return Promise.reject({ motivo: 'Tu base todavía no tiene «' + fn + '». Vuelve a correr base/supabase.sql completo en el SQL Editor.' });
      if (r && r.rechaza) return Promise.reject(r.rechaza);
      return Promise.resolve(typeof r === 'function' ? r(c) : r);
    };
    return { l, rpc };
  }
  test('lo de UNA persona: la ficha dice «Dice que usa …», pedido con la clave y su celular', async () => {
    const N = rpcDe({ extracto_de: { ok: true, celular: CEL, autorizacion: AUT, archivos: [] },
      extracto_plataformas_de: { ok: true, celular: CEL, plataformas: 'nequi,lulo' } });
    const d = await XC.de(N.rpc, CLAVE, '+57 ' + CEL);
    assert.deepEqual(N.l[1], { fn: 'extracto_plataformas_de', c: { p_clave: CLAVE, p_celular: CEL } });
    const t = plano(XC.bloque(d, {}));
    assert.match(t, /Dice que usa Nequi y Lulo Bank · lo marcó la persona/);
  });
  test('quien no marcó ninguna no ocupa sitio; quien no autorizó o retiró, ni se pregunta', async () => {
    const N = rpcDe({ extracto_de: { ok: true, celular: CEL, autorizacion: AUT, archivos: [] },
      extracto_plataformas_de: { ok: true, celular: CEL, plataformas: '' } });
    assert.equal(/Dice que usa|plataformas/.test(XC.bloque(await XC.de(N.rpc, CLAVE, CEL), {})), false);
    const sin = rpcDe({ extracto_de: { ok: true, celular: CEL, autorizacion: null, archivos: [] } });
    await XC.de(sin.rpc, CLAVE, CEL);
    assert.deepEqual(sin.l.map(x => x.fn), ['extracto_de']);
    const retirada = rpcDe({ extracto_de: { ok: true, celular: CEL, autorizacion: Object.assign({}, AUT, { revocada_en: '2026-11-24T16:00:00Z' }), archivos: [] } });
    await XC.de(retirada.rpc, CLAVE, CEL);
    assert.deepEqual(retirada.l.map(x => x.fn), ['extracto_de']);
  });
  test('no poder preguntar no es «no marcó ninguna»: sin el SQL dice cuál correr; con otro fallo, que no pudo', async () => {
    const falta = rpcDe({ extracto_de: { ok: true, celular: CEL, autorizacion: AUT, archivos: [] } });
    const d1 = await XC.de(falta.rpc, CLAVE, CEL);
    assert.equal(d1.plataformasEstado, 'falta');
    assert.match(plano(XC.bloque(d1, {})), /Qué plataformas usa: tu base todavía no tiene esa parte\. Corre base\/20261124_plataformas_del_extracto\.sql/);
    const error = rpcDe({ extracto_de: { ok: true, celular: CEL, autorizacion: AUT, archivos: [] },
      extracto_plataformas_de: { rechaza: { motivo: 'No hubo conexión con la nube.' } } });
    const d2 = await XC.de(error.rpc, CLAVE, CEL);
    assert.equal(d2.plataformasEstado, 'error');
    assert.match(plano(XC.bloque(d2, {})), /No pude preguntar qué plataformas dijo que usa\. Eso no quiere decir que no marcó ninguna\./);
    /* Y lo demás de sus extractos se ve igual. */
    assert.match(plano(XC.bloque(d2, {})), /Autorizó el/);
  });
  test('📥 Registrados: las de todos de un solo viaje, junto a quien subió y a quien solo autorizó', async () => {
    const OTRO = '3001119988';
    const N = rpcDe({
      extracto_resumen: { ok: true, espacio: null, personas: [
        { celular: CEL, version: '2026-11-24', autorizada_en: AUT.autorizada_en, revocada_en: null, pdf: 1, imagenes: 0, ultimo: '2026-11-24T15:10:00Z' },
        { celular: OTRO, version: '2026-11-24', autorizada_en: AUT.autorizada_en, revocada_en: null, pdf: 0, imagenes: 0, ultimo: null }] },
      extracto_plataformas_de: { ok: true, personas: [{ celular: CEL, plataformas: 'nequi' }, { celular: OTRO, plataformas: 'daviplata,otra' },
        { celular: '3000000000', plataformas: 'lulo' }] } });
    const r = await XC.resumen(N.rpc, CLAVE);
    assert.deepEqual(N.l[1], { fn: 'extracto_plataformas_de', c: { p_clave: CLAVE } }, 'las de todos se piden sin celular');
    assert.equal(r.porCelular[CEL].plataformas, 'nequi');
    assert.equal(Object.keys(r.porCelular).length, 2, 'entró alguien que no estaba en el resumen');
    const t = plano(XC.bloqueRegistros(r.porCelular, { estado: 'ok' }));
    assert.match(t, /1 PDF · subido el [^·]+ · dice que usa Nequi/);
    assert.match(t, /Autorizaron y todavía no suben nada: 300 111 9988 \(dice que usa Daviplata y Otro banco\)/);
    assert.match(t, /De quien quiso darlos, empleado o no/);
    assert.equal(/no son empleados/.test(t), false, 'el CRM sigue diciendo que es solo de quien no es empleado');
  });
  test('sin nadie no se pregunta; y si esa pregunta falla, la lista de extractos sale igual', async () => {
    const nadie = rpcDe({ extracto_resumen: { ok: true, espacio: null, personas: [] } });
    await XC.resumen(nadie.rpc, CLAVE);
    assert.deepEqual(nadie.l.map(x => x.fn), ['extracto_resumen']);
    const falla = rpcDe({ extracto_resumen: { ok: true, espacio: null, personas: [{ celular: CEL, pdf: 1, imagenes: 0 }] } });
    const r = await XC.resumen(falla.rpc, CLAVE);
    assert.equal(Object.keys(r.porCelular).length, 1);
    assert.equal(r.porCelular[CEL].plataformas, undefined);
  });
  test('lo que llega de la base se pinta escapado y solo si es de la lista', () => {
    const d = { celular: CEL, autorizacion: AUT, archivos: [], plataformas: 'nequi,<img src=x onerror=alert(1)>' };
    const h = XC.bloque(d, {});
    assert.equal(/<img/.test(h), false);
    assert.match(plano(h), /Dice que usa Nequi ·/);
  });
});

/* ======================================================================== */
describe('6 · el SQL: lo que se puede comprobar leyéndolo', () => {
  const VIEJO = leer('base/20261113c_los_extractos.sql').replace(/--[^\n]*/g, '');
  const funciones = t => [...t.matchAll(/create or replace function public\.(\w+)\s*\(/g)].map(m => m[1]);
  test('va después de los extractos y se para en su paso 0 si faltan', () => {
    const base = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /^\d{8}.*\.sql$/.test(f)).sort();
    assert.ok(base.indexOf('20261113c_los_extractos.sql') < base.indexOf('20261124_plataformas_del_extracto.sql'));
    const paso0 = CODIGO.slice(0, CODIGO.indexOf('end $$;') + 7);
    assert.match(paso0, /to_regclass\('public\.extracto_autorizaciones'\) is null[\s\S]*?raise exception 'Primero corre base\/20261113c_los_extractos\.sql/);
    assert.ok(CODIGO.indexOf('do $$') < CODIGO.search(/alter table|create or replace function|create trigger/), 'toca algo antes de revisar');
  });
  test('solo crea funciones extracto_plataformas…: no reescribe NINGUNA de las que ya existen', () => {
    const mias = funciones(CODIGO);
    assert.deepEqual(mias.slice().sort(), ['extracto_plataformas', 'extracto_plataformas_al_retirar', 'extracto_plataformas_de',
      'extracto_plataformas_interna', 'extracto_plataformas_limpia', 'extracto_plataformas_mias']);
    const viejas = funciones(VIEJO);
    mias.forEach(f => assert.equal(viejas.indexOf(f), -1, 'reescribe ' + f + ', que es de 20261113c'));
    /* Todas empiezan por extracto_: la comprobación 6 de 20261113c exige que solo ellas lean esas tablas. */
    mias.forEach(f => assert.match(f, /^extracto_/));
    assert.equal(/(insert\s+into|update|delete\s+from)\s+auth\.users\b/i.test(CODIGO), false);
  });
  test('la columna es idempotente y no deja sitio para texto libre', () => {
    assert.match(CODIGO, /alter table public\.extracto_autorizaciones\s+add column if not exists plataformas text not null default ''/);
    assert.match(CODIGO, /drop constraint if exists extracto_plataformas_de_la_lista;[\s\S]*?add constraint extracto_plataformas_de_la_lista\s+check \(plataformas ~ '\^\(\[a-z\]\+\(,\[a-z\]\+\)\*\)\?\$' and length\(plataformas\) <= 60\)/);
    assert.equal(/create table/.test(CODIGO.replace(/create temporary table/g, '')), false, 'crea una tabla nueva: tendría que llevar su RLS');
  });
  test('guardar: con la sesión, solo con la autorización VIGENTE, y pasando por la lista', () => {
    const f = CODIGO.slice(CODIGO.indexOf('function public.extracto_plataformas(p_plataformas text)'), CODIGO.indexOf('function public.extracto_plataformas_mias()'));
    assert.match(f, /security definer\s+set search_path = public/);
    assert.match(f, /cel := public\.celular_de_sesion\(\);\s+if cel is null then[\s\S]*?'sin_sesion'/);
    assert.match(f, /v := public\.extracto_plataformas_limpia\(p_plataformas\);/);
    assert.match(f, /update public\.extracto_autorizaciones a\s+set plataformas = v\s+where a\.celular = cel and a\.revocada_en is null;/);
    assert.match(f, /if n = 0 then\s+return jsonb_build_object\('ok', false, 'motivo', 'sin_autorizacion'\);/);
    assert.equal(/p_celular|p_clave/.test(f), false, 'la del cliente recibe un celular o una clave: tiene que salir de su sesión');
  });
  test('al retirar la autorización se borran: un disparador, sin tocar extracto_retirar', () => {
    assert.match(CODIGO, /if new\.revocada_en is not null then\s+new\.plataformas := '';/);
    assert.match(CODIGO, /drop trigger if exists extracto_plataformas_al_retirar on public\.extracto_autorizaciones;\s+create trigger extracto_plataformas_al_retirar\s+before update on public\.extracto_autorizaciones\s+for each row execute function public\.extracto_plataformas_al_retirar\(\);/);
    assert.equal(/function public\.extracto_retirar/.test(CODIGO), false);
  });
  test('la de Joan pide su clave antes de nada y es volátil; lo de adentro no se le da a nadie', () => {
    const f = CODIGO.slice(CODIGO.indexOf('function public.extracto_plataformas_de('), CODIGO.indexOf('revoke all'));
    assert.match(f, /volatile\s+security definer\s+set search_path = public/);
    assert.match(f, /begin\s+if not public\.clave_ok\(p_clave\) then\s+perform pg_sleep\(1\);\s+raise exception 'clave de sincronización incorrecta';\s+end if;\s+return public\.extracto_plataformas_interna\(p_celular\);/);
  });
  test('los permisos en dos tiempos: revoke a public, anon y authenticated de las seis; después lo justo', () => {
    const FIRMAS = ['extracto_plataformas_limpia(text)', 'extracto_plataformas(text)', 'extracto_plataformas_mias()',
      'extracto_plataformas_al_retirar()', 'extracto_plataformas_interna(text)', 'extracto_plataformas_de(text, text)'];
    FIRMAS.forEach(s => assert.ok(new RegExp('revoke all on function public\\.' + s.replace(/[()]/g, '\\$&') + '\\s+from public, anon, authenticated;').test(CODIGO), 'falta el revoke de ' + s));
    const grants = [...CODIGO.matchAll(/grant execute on function public\.(\w+\([^)]*\))\s+to (\w+);/g)].map(m => m[1] + ' → ' + m[2]).sort();
    assert.deepEqual(grants, ['extracto_plataformas(text) → authenticated', 'extracto_plataformas_de(text, text) → anon', 'extracto_plataformas_mias() → authenticated']);
    assert.ok(CODIGO.lastIndexOf('revoke all on function') < CODIGO.indexOf('grant execute'), 'un grant va antes de un revoke');
    assert.match(CODIGO, /notify pgrst, 'reload schema';/);
  });
  test('la prueba llamando corre CADA función que tiene cuerpo propio, limpia lo que deja, y termina en la tabla que Joan ve', () => {
    const prueba = CODIGO.slice(CODIGO.indexOf('do $prueba$'), CODIGO.indexOf('$prueba$;'));
    ['public.extracto_plataformas(', 'public.extracto_plataformas_mias()', 'public.extracto_plataformas_interna(', 'public.extracto_retirar()',
     'public.extracto_autorizar('].forEach(f => assert.ok(prueba.indexOf(f) >= 0, 'la prueba no llama a ' + f));
    const pasos = [...prueba.matchAll(/insert into plataformas_prueba values \('(\w+)'/g)].map(m => m[1]).filter(p => p !== 'llamando');
    assert.equal(pasos.length, 10);
    assert.equal(new Set(pasos).size, 10, 'dos pasos con el mismo nombre: el segundo reventaría la llave');
    assert.match(CODIGO, /select count\(\*\) = 10 and bool_and\(coalesce\(ok, false\)\) from plataformas_prueba/);
    assert.match(prueba, /delete from public\.extracto_autorizaciones a where a\.celular = v_cel;\s+delete from public\.intentos_fallidos f where f\.cedula = 'ex:' \|\| v_cel;/);
    /* La de la clave NO se llama: una clave falsa le suma un fallo al freno de Joan. */
    assert.equal(/extracto_plataformas_de\(/.test(prueba), false);
    assert.equal(/clave_ok\(/.test(prueba), false);
    assert.match(CODIGO, /order by 1;\s*$/);
  });
  test('ninguna variable se llama como una columna de la tabla (la lección de 20260908b)', () => {
    const columnas = ['celular', 'version', 'momento', 'recibida_en', 'revocada_en', 'historial', 'plataformas'];
    [...CODIGO.matchAll(/declare([\s\S]*?)begin/g)].forEach(m => {
      const vars = [...m[1].matchAll(/^\s*(\w+)\s+(?:text|integer|jsonb|boolean)/gm)].map(x => x[1]);
      vars.forEach(v => assert.equal(columnas.indexOf(v), -1, 'la variable «' + v + '» se llama como una columna'));
    });
  });
});

/* ======================================================================== */
describe('7 · se declara donde toca', () => {
  const P = leer('legal/privacidad.html').replace(/<!--[\s\S]*?-->/g, '');
  const texto = plano(P);
  test('la política: en la tabla, en la sección de los extractos y en «Lo que cambió»', () => {
    assert.match(texto, /Los extractos de tus cuentas \(Nequi, Daviplata o banco\), y cuáles de esas plataformas marcas que usas/);
    assert.match(texto, /Qué plataformas usas: con esa misma autorización puedes marcar, si quieres, cuáles usas: Nequi, Daviplata, Nubank, Lulo Bank, Bancolombia u otro banco\./);
    assert.match(texto, /no lo confirmamos con ningún banco ni entramos a ninguna cuenta/);
    assert.match(texto, /lo ve solo quien dirige el negocio, y se borra cuando retiras la autorización/);
    assert.match(texto, /Con esa misma autorización puedes marcar cuáles plataformas usas; tampoco es obligatorio\./);
  });
  test('la política nombra las mismas plataformas que se ofrecen', () => {
    EX.PLATAFORMAS.filter(p => p.id !== 'otra').forEach(p => assert.ok(texto.indexOf(p.nombre) >= 0, 'la política no nombra ' + p.nombre));
  });
  test('cumplimiento: declarado como información financiera opcional, y en lo que se borra con la cuenta', () => {
    const C = require('../app/cumplimiento.js');
    const js = leer('app/cumplimiento.js');
    assert.match(js, /id: 'extractos_plataformas', etiqueta: 'Cuáles plataformas marcas que usas \(Nequi, Daviplata, bancos\)',\s+categoria: 'Información financiera · Otra información financiera',\s+obligatorio: false/);
    assert.match(js, /'Los extractos de tus cuentas que nos subiste y las plataformas que marcaste que usas, si nos los diste\.'/);
    assert.ok(C, 'cumplimiento.js no carga');
    assert.match(leer('PLAY-FICHA.md'), /Cuáles plataformas marcas que usas \(Nequi, Daviplata, bancos\)/, 'la ficha de Play no se regeneró');
  });
  test('la nota de la versión nombra el SQL nuevo, y el archivo existe', () => {
    assert.match(leer('sw.js'), /base\/20261124_plataformas_del_extracto\.sql/);
    assert.ok(fs.existsSync(path.join(RAIZ, SQL_NOMBRE)));
  });
});
