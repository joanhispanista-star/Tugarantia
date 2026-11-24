'use strict';
/* ==========================================================================
 * EL CRM EN UN CELULAR, SOLO PARA MIRAR — 23 de noviembre de 2026 (etapa U1)
 *
 *   node --test pruebas/crm-remoto.test.js
 *
 * Joan: «quiero poder abrir el crm desde mi celular… tener toda la informacion
 * actualizada en mi telefono, no quiero subir nada a la nube de forma manual».
 * La idea que no se negocia (RECETA-PLAN-UN-SOLO-CRM.md): el celular NUNCA
 * guarda la cartera en la gaveta del CRM. Estas pruebas vigilan eso por tres
 * lados:
 *
 *   1. LO PURO de panel/crm-remoto.js: qué puerta le toca a cada aparato, qué
 *      pasa del paquete de la nube, qué acciones son de mirar.
 *   2. LA PIEZA CON UNA PANTALLA DE MENTIRA: la puerta, la entrada, las rejas.
 *   3. EL crm.html DE VERDAD (banco-panel.js): con la pieza activa, cargar()
 *      sale de la memoria y guardar() no escribe; sin ella, todo como siempre.
 *
 * Lo que depende de pintar de verdad (la franja, las tapas, los toques con el
 * dedo) se corre aparte en Chrome sin ventana con una nube de mentira, y en un
 * iPhone de verdad no lo ha visto nadie todavía.
 *
 * Los nombres y celulares son inventados: nada de esto es de nadie.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { abrirPanel } = require('./banco-panel.js');

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const R = require('../panel/crm-remoto.js');
const NUBE = require('../panel/nube.js');
const CRM = LEER('panel/crm.html');

const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 };
const ANDROID = { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', maxTouchPoints: 5 };
const IPAD = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', maxTouchPoints: 5 };
const PC = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', maxTouchPoints: 0 };
const PC_TACTIL = Object.assign({}, PC, { maxTouchPoints: 10 });
const MAC = { userAgent: IPAD.userAgent, maxTouchPoints: 0 };

/* Un paquete con la forma de panel_traer. */
function fila(id, datos, por, cuando, extra) {
  return Object.assign({ id, datos, revision: 3, borrado: false, actualizado_en: cuando || '2026-11-23T14:21:00Z', actualizado_por: por || 'computador' }, extra || {});
}
function ajuste(clave, datos, por, cuando) {
  return { clave, datos, revision: 2, actualizado_en: cuando || '2026-08-18T10:00:00Z', actualizado_por: por || 'computador' };
}
function paquete() {
  return {
    servidor_ahora: '2026-11-23T15:30:00Z', completo: true,
    socios: [fila('s1', { id: 's1', numero: 1, nombre: 'Camila Rojas', telefono: '3001112233' }),
             fila('s2', { id: 's2', numero: 2, nombre: 'Andrés Pardo', telefono: '3004445566' })],
    creditos: [fila('c1', { id: 'c1', numero: 11, socioId: 's1', socioNombre: 'Camila Rojas', capital: 300000, costoPct: 20, fechaDesembolso: '2026-11-16', cicloActual: '2026-11-30', pagado: false }),
               fila('c2', { id: 'c2', numero: 12, socioId: 's2', socioNombre: 'Andrés Pardo', capital: 200000, costoPct: 20, fechaDesembolso: '2026-10-16', cicloActual: '2026-10-31', pagado: true, fechaPagado: '2026-10-31' }, 'computador', '2026-11-23T15:02:00Z')],
    respaldados: [],
    ajustes: [
      ajuste('config', { negocio: 'Tu Garantía', costoBasePct: 20, pin: '4821', ultimoRespaldo: '2026-08-17' }),
      ajuste('plantillas', { bienvenida: 'Hola {nombre}' }),
      ajuste('equipo', [{ id: 'a1', nombre: 'Asesor Uno' }]),
      ajuste('gestiones', [{ id: 'g1', socioId: 's1', fecha: '2026-11-22' }]),
      ajuste('prospectos', [{ id: 'p1', nombre: 'Prospecto Viejo' }]),
      ajuste('bases', [{ id: 'b1' }]),
      ajuste('papelera', [{ id: 'cx', capital: 1 }]),
      ajuste('papeleraSocios', [{ id: 'sx' }]),
      ajuste('misNumeros', [{ numero: '3009998877' }])
    ],
    contadores: { cliente: 2, credito: 12, respaldado: 0 }
  };
}

/* ------------------------------------------------------------------ 1 ---- */
describe('crm-remoto · lo puro', () => {
  test('la puerta se decide por el tipo de aparato, nunca por el ancho', () => {
    assert.equal(R.esCelular(IPHONE), true);
    assert.equal(R.esCelular(ANDROID), true);
    assert.equal(R.esCelular(IPAD), true, 'el iPad se presenta como Macintosh, pero se toca');
    assert.equal(R.esCelular(PC), false);
    assert.equal(R.esCelular(PC_TACTIL), false, 'un PC con pantalla táctil sigue siendo el PC');
    assert.equal(R.esCelular(MAC), false);
    assert.equal(R.esCelular(null), false);
  });

  test('un computador SIEMPRE tiene la puerta del PIN, con cartera o sin ella', () => {
    assert.equal(R.quePuerta({ celular: false, conFichas: true }), 'pin');
    assert.equal(R.quePuerta({ celular: false, conFichas: false }), 'pin');
    assert.equal(R.quePuerta({}), 'pin');
  });

  test('un celular sin cartera entra con correo; con una copia vieja, su PIN la sigue abriendo', () => {
    assert.equal(R.quePuerta({ celular: true, conFichas: false }), 'correo');
    assert.equal(R.quePuerta({ celular: true, conFichas: true }), 'copia');
  });

  test('la puerta del equipo no se toca: con #equipo, ni en un celular', () => {
    assert.equal(R.quePuerta({ celular: true, conFichas: false, equipo: true }), 'pin');
  });

  test('la gaveta: vacía, con fichas, y dañada (que no cuenta como vacía)', () => {
    assert.equal(R.gavetaConFichas(null), false);
    assert.equal(R.gavetaConFichas(''), false);
    assert.equal(R.gavetaConFichas(JSON.stringify({ socios: [], prestamos: [], config: { pin: '1234' } })), false);
    assert.equal(R.gavetaConFichas(JSON.stringify({ socios: [{ id: 's1' }] })), true);
    assert.equal(R.gavetaConFichas(JSON.stringify({ clientes: [{ id: 's1' }] })), true, 'el nombre viejo de la lista');
    assert.equal(R.gavetaConFichas(JSON.stringify({ respaldados: [{ id: 'r1' }] })), true);
    assert.equal(R.gavetaConFichas('{esto no es json'), true, 'un disco dañado no es un disco vacío');
  });

  test('del paquete pasan las fichas y seis ajustes; prospectos, bases y papeleras NO', () => {
    const original = paquete(), copia = JSON.stringify(original);
    const p = R.paqueteParaMirar(original);
    assert.equal(JSON.stringify(original), copia, 'el paquete que llega no se toca');
    assert.equal(p.socios.length, 2);
    assert.equal(p.creditos.length, 2);
    assert.deepEqual(p.ajustes.map(a => a.clave).sort(), ['config', 'equipo', 'gestiones', 'plantillas']);
    for (const k of ['prospectos', 'bases', 'papelera', 'papeleraSocios', 'misNumeros']) {
      assert.ok(!p.ajustes.some(a => a.clave === k), k + ' no viaja al celular');
    }
  });

  test('el PIN del computador no llega al celular, ni la fecha de su respaldo', () => {
    const p = R.paqueteParaMirar(paquete());
    const config = p.ajustes.find(a => a.clave === 'config').datos;
    assert.equal(config.pin, undefined);
    assert.equal(config.ultimoRespaldo, undefined);
    assert.equal(config.negocio, 'Tu Garantía', 'lo demás de config sí');
    const { db } = R.armar(null, paquete());
    assert.equal(db.config.pin, undefined, 'tampoco en la cartera armada');
    assert.ok(!JSON.stringify(db).includes('4821'), 'el PIN no está en ninguna parte de lo que se arma');
  });

  test('armar: la primera vez todo; después, solo lo que cambió, sin tocar la anterior', () => {
    const a = R.armar(null, paquete());
    assert.deepEqual(R.contar(a.db), { socios: 2, creditos: 2, respaldados: 0 });
    assert.equal(a.db.prestamos[0].capital, 300000);
    assert.deepEqual(a.db.prospectos, undefined);
    const foto = JSON.stringify(a.db);
    /* El computador cobró el crédito c1 y borró a s2. */
    const nuevo = { servidor_ahora: '2026-11-23T15:40:00Z', completo: false, respaldados: [], ajustes: [],
      socios: [fila('s2', null, 'computador', '2026-11-23T15:38:00Z', { borrado: true })],
      creditos: [fila('c1', { id: 'c1', numero: 11, socioId: 's1', socioNombre: 'Camila Rojas', capital: 300000, costoPct: 20, pagado: true, fechaPagado: '2026-11-23' }, 'computador', '2026-11-23T15:39:00Z')] };
    const b = R.armar(a.db, nuevo);
    assert.equal(JSON.stringify(a.db), foto, 'la cartera anterior no se toca');
    assert.deepEqual(R.contar(b.db), { socios: 1, creditos: 2, respaldados: 0 });
    assert.equal(b.db.prestamos.find(c => c.id === 'c1').pagado, true);
  });

  test('un paquete sin fichas NO abre un CRM en $0: lo dice', () => {
    assert.equal(R.motivoDeNoAbrir({ socios: 2, creditos: 0, respaldados: 0 }), '');
    assert.equal(R.motivoDeNoAbrir({ socios: 0, creditos: 0, respaldados: 1 }), '');
    const m = R.motivoDeNoAbrir(R.contar(R.armar(null, { socios: [], creditos: [], respaldados: [], ajustes: [] }).db));
    assert.match(m, /no trae ninguna ficha/);
    assert.match(m, /No abro un CRM vacío/);
  });

  test('el último cambio: el más nuevo de lo que este celular mira, y quién lo subió', () => {
    const u = R.ultimoCambio(paquete(), null);
    assert.deepEqual(u, { cuando: '2026-11-23T15:02:00Z', quien: 'computador' });
    /* Una traída parcial sin filas deja el que había. */
    assert.deepEqual(R.ultimoCambio({ socios: [], creditos: [], respaldados: [], ajustes: [] }, u), u);
    /* La papelera de la nube puede ser más nueva: no cuenta, este celular no la mira. */
    const p = paquete();
    p.ajustes.push(ajuste('papelera', [], 'computador', '2026-11-23T15:29:00Z'));
    assert.equal(R.ultimoCambio(p, null).cuando, '2026-11-23T15:02:00Z');
  });

  test('la franja solo dice lo que se midió', () => {
    const ahora = new Date(2026, 10, 23, 10, 30, 0).getTime();
    const ultimo = { cuando: new Date(2026, 10, 23, 9, 21, 0).toISOString(), quien: 'computador' };
    assert.equal(R.textoFranja({ miradoEn: ahora - 4 * 60000, ultimo }, ahora),
      'Mirado en la nube hace 4 min · último cambio de tu computador: hoy, 9:21 a. m.');
    assert.equal(R.textoFranja({ miradoEn: ahora - 20000, ultimo: { cuando: new Date(2026, 10, 22, 18, 40).toISOString(), quien: 'celular' } }, ahora),
      'Mirado en la nube hace un momento · último cambio desde un celular: ayer, 6:40 p. m.');
    /* Sin señal: no dice «al día». Dice de qué hora son los datos. */
    const t = R.textoFranja({ fallo: 'Sin internet.', sinRed: true, miradoEn: ahora - 69 * 60000, ultimo }, ahora);
    assert.match(t, /^Sin señal · son datos de las 9:21 a\. m\./);
    assert.ok(!/al día/i.test(t));
    assert.match(R.textoFranja({ fallo: 'Supabase respondió 500', miradoEn: ahora - 60000 }, ahora), /^No pude mirar la nube/);
  });

  test('las horas, dichas como las dice la gente', () => {
    const ahora = new Date(2026, 10, 23, 10, 30, 0).getTime();
    assert.equal(R.horaCorta(new Date(2026, 10, 23, 0, 5).getTime()), '12:05 a. m.');
    assert.equal(R.horaCorta(new Date(2026, 10, 23, 12, 0).getTime()), '12:00 p. m.');
    assert.equal(R.horaCorta(new Date(2026, 10, 23, 15, 7).getTime()), '3:07 p. m.');
    assert.equal(R.cuandoFue(new Date(2026, 10, 18, 15, 5).getTime(), ahora), 'el 18 de nov, 3:05 p. m.');
    assert.equal(R.haceCuanto(ahora - 3 * 3600000, ahora), 'hace 3 h');
    assert.equal(R.haceCuanto(ahora - 26 * 3600000, ahora), 'hace 1 día');
  });

  test('una acción pasa SOLO si su nombre está en la lista de mirar', () => {
    assert.equal(R.codigoDeMirar("verCliente('s1')"), true);
    assert.equal(R.codigoDeMirar("event.stopPropagation();verCredito('c1')"), true);
    assert.equal(R.codigoDeMirar('cerrarModal()'), true);
    assert.equal(R.codigoDeMirar("irA('cobranzas')"), true);
    for (const escribe of ["nuevoCredito()", "abrirPago('c1')", "registrarCobro('c1')", "borrarCredito('c1')", "guardarCliente()",
      "editarCliente('s1')", "exportar()", "enviarCobranzas()", "gestionar('s1')", "vaciarPapelera()", "sincronizarSocios()",
      "mandarComoEntrar('s1')", "guardarCfg()", "importar(event)", "subirFoto(this)"]) {
      assert.equal(R.codigoDeMirar(escribe), false, escribe + ' no es de mirar');
    }
  });

  test('una función nueva queda bloqueada por defecto', () => {
    assert.equal(R.codigoDeMirar("unaFuncionQueTodaviaNoExiste('x')"), false);
    assert.equal(R.codigoDeMirar(''), false, 'lo que no se entiende no pasa');
    assert.equal(R.codigoDeMirar('this.classList.toggle("on")'), false);
  });

  test('empezar con una de mirar no alcanza: todas las llamadas tienen que serlo', () => {
    assert.equal(R.codigoDeMirar("irA('cred');nuevoCredito()"), false);
    assert.equal(R.codigoDeMirar("cerrarModal();verCliente('s1')"), true);
    assert.equal(R.codigoDeMirar("window.open(waLink('300','hola'),'_blank')"), false);
    assert.equal(R.codigoDeMirar("if(event.target.tagName!=='A')accionNubeTodo()"), false);
  });

  test('cada acción de la lista de mirar existe en crm.html (una lista con nombres muertos no vigila nada)', () => {
    for (const n of R.MIRAR) {
      assert.ok(new RegExp('function\\s+' + n + '\\s*\\(').test(CRM), n + ' ya no existe en crm.html: sácala de MIRAR');
    }
  });

  test('ninguna acción de mirar guarda, sale a la red ni abre otra página', () => {
    const cuerpo = n => {
      const m = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + n + '\\s*\\(').exec(CRM);
      const i = CRM.indexOf('{', m.index);
      let prof = 0, j = i;
      for (; j < CRM.length; j++) { if (CRM[j] === '{') prof++; else if (CRM[j] === '}' && !--prof) break; }
      return CRM.slice(i, j + 1);
    };
    for (const n of R.MIRAR) {
      const c = cuerpo(n);
      assert.ok(!/\bguardar\(|localStorage\.setItem|\bfetch\(|window\.open\(/.test(c), n + ' escribe o sale a la red: no puede estar en MIRAR');
    }
  });

  test('WhatsApp y SMS son escribir hacia afuera; llamar no', () => {
    assert.equal(R.enlaceQueEscribe('https://wa.me/573001112233?text=hola'), true);
    assert.equal(R.enlaceQueEscribe('https://api.whatsapp.com/send?phone=57300'), true);
    assert.equal(R.enlaceQueEscribe('whatsapp://send?text=x'), true);
    assert.equal(R.enlaceQueEscribe('sms:3001112233'), true);
    assert.equal(R.enlaceQueEscribe('tel:3001112233'), false);
    assert.equal(R.enlaceQueEscribe('../app/socio.html#v=abc'), false);
    assert.equal(R.enlaceQueEscribe(''), false);
  });

  test('las pestañas que todavía no pueden decir la verdad lo dicen, y existen', () => {
    for (const v of Object.keys(R.TAPAS)) {
      assert.ok(CRM.includes('id="v-' + v + '"'), 'la vista v-' + v + ' existe en crm.html');
      assert.ok(CRM.includes('data-v="' + v + '"'), 'y tiene su botón en el menú');
      assert.ok(R.tapaDe(v).length > 40);
      assert.ok(!/\d+%/.test(R.tapaDe(v)));
    }
    assert.equal(R.tapaDe('clientes'), '', 'Clientes sí abre');
    assert.equal(R.tapaDe('cred'), '');
    assert.equal(R.tapaDe('cobranzas'), '');
  });

  test('la conexión de fábrica es la misma de traer.html y de espejo.html', () => {
    for (const f of ['panel/traer.html', 'panel/espejo.html']) {
      const t = LEER(f);
      assert.ok(t.includes(R.CONEXION.url), f + ' usa la misma dirección');
      assert.ok(t.includes(R.CONEXION.anon), f + ' usa la misma llave pública');
    }
    assert.match(R.CONEXION.anon, /^sb_publishable_/, 'es la llave pública, no una secreta');
  });

  test('la gaveta que se protege es la del CRM, la que nombra el puente', () => {
    assert.equal(R.GAVETA, require('../app/puente.js').LLAVE_PANEL);
  });
});

/* ------------------------------------------------------------------ 2 ----
   Una pantalla de mentira, lo justo para la puerta y las rejas. */
function pantalla(o) {
  o = o || {};
  const almacen = Object.assign({}, o.almacen || {});
  const porId = {};
  function nodo(etiqueta) {
    const n = {
      tagName: String(etiqueta || 'div').toUpperCase(), hijos: [], padre: null, style: {}, _attrs: {}, _oyentes: {},
      _id: '', className: '', textContent: '', value: '', disabled: false,
      get id() { return this._id; }, set id(v) { this._id = v; if (v) porId[v] = this; },
      classList: null,
      set innerHTML(h) {
        this._html = String(h); this.hijos = [];
        /* Los elementos con id de lo que se pinta quedan a mano, como en un navegador. */
        for (const m of String(h).matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)) { const x = nodo(m[1]); x.id = m[2]; x.padre = this; this.hijos.push(x); }
      },
      get innerHTML() { return this._html || ''; },
      get parentNode() { return this.padre; },
      get firstChild() { return this.hijos[0] || null; },
      get nextSibling() { if (!this.padre) return null; const i = this.padre.hijos.indexOf(this); return this.padre.hijos[i + 1] || null; },
      setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
      appendChild(x) { x.padre = this; this.hijos.push(x); return x; },
      insertBefore(x, ref) { x.padre = this; const i = ref ? this.hijos.indexOf(ref) : -1; if (i < 0) this.hijos.push(x); else this.hijos.splice(i, 0, x); return x; },
      addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
      dispatch(t, ev) { (this._oyentes[t] || []).forEach(f => f(ev || { preventDefault() {} })); },
      querySelector(sel) { return buscar(this, sel); },
      closest() { return null; }
    };
    const clases = new Set();
    n.classList = { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c),
      toggle: (c, s) => { if (s === undefined ? !clases.has(c) : s) clases.add(c); else clases.delete(c); } };
    n._clases = clases;
    return n;
  }
  function buscar(raiz, sel) {
    const clase = sel.replace(/^\./, '');
    const cola = [...raiz.hijos];
    while (cola.length) {
      const x = cola.shift();
      if (x.className.split(' ').includes(clase) || x._clases.has(clase)) return x;
      cola.push(...x.hijos);
    }
    return null;
  }
  const body = nodo('body'), head = nodo('head'), tarjeta = nodo('div'), principal = nodo('main');
  tarjeta.className = 'gate-card';
  const cajaPin = nodo('div'), pin = nodo('input'); pin.id = 'pinInput'; cajaPin.appendChild(pin); tarjeta.appendChild(cajaPin);
  for (const id of ['pinBtn', 'pinErr', 'salidaPuerta']) { const x = nodo('div'); x.id = id; tarjeta.appendChild(x); }
  const equipo = nodo('button'); equipo.className = 'gate-link'; tarjeta.appendChild(equipo);
  principal.className = 'main';
  const oyentesDoc = [];
  const document = {
    body, head, visibilityState: 'visible',
    getElementById: id => porId[id] || null,
    querySelector: sel => (sel === '#gate .gate-card' ? tarjeta : sel === '.main' ? principal : null),
    createElement: nodo,
    addEventListener(t, f, captura) { oyentesDoc.push({ t, f, captura: captura === true }); }
  };
  class Storage {
    getItem(k) { return k in almacen ? almacen[k] : null; }
    setItem(k, v) { almacen[k] = String(v); }
    removeItem(k) { delete almacen[k]; }
  }
  const abiertas = [], pendientes = [], recargas = [];
  let reloj = o.ahora || new Date(2026, 10, 23, 10, 30, 0).getTime();
  /* La nube de mentira: la conversión es la de verdad (NUBE.aplicarPaquete). */
  const nube = Object.assign({
    _sesion: o.sesion || null, _traidas: [], _salidas: 0, _config: {},
    aplicarPaquete: NUBE.aplicarPaquete,
    config() { return this._config; },
    guardarConfig(c) { this._config = Object.assign({}, c); return this._config; },
    sesion() { return this._sesion; },
    entrar(correo, clave) {
      if (clave !== 'la-buena') return Promise.reject({ motivo: 'El correo o la contraseña no coinciden.' });
      this._sesion = { access_token: 'tok', refresh_token: 'ref', correo }; return Promise.resolve(this._sesion);
    },
    traer(desde) { this._traidas.push(desde); return typeof o.traer === 'function' ? o.traer(desde, this._traidas.length) : Promise.resolve(paquete()); },
    salir() { this._salidas++; this._sesion = null; return Promise.resolve(true); }
  }, o.nube || {});
  const W = {
    document, navigator: o.navegador || IPHONE, Storage, localStorage: new Storage(),
    NubeTuGarantia: nube, CuentaSocio: require('../app/cuenta.js'),
    open(url) { abiertas.push(String(url)); return {}; },
    setTimeout(f, ms) { pendientes.push({ f, ms }); return pendientes.length; }, clearTimeout() {},
    setInterval() { return 1; }, addEventListener() {},
    location: { reload() { recargas.push(1); }, hash: '' },
    Date: class extends Date { static now() { return reloj; } },
    JSON, Math, Promise, Error, Object, Array, String, Number, RegExp, isNaN
  };
  W.globalThis = W; W.window = W; W.self = W;
  vm.createContext(W);
  vm.runInContext(LEER('panel/crm-remoto.js'), W, { filename: 'crm-remoto.js' });
  /* Lo que crm.html presta. */
  const estado = { DB: { socios: [], prestamos: [] }, abrio: 0, repintadas: [], ocupado: false };
  const ganchos = {
    db: () => estado.DB,
    abrir() { estado.abrio++; estado.DB = W.CrmRemoto.paraCargar(); },
    repintar(tras) { estado.repintadas.push(!!tras); estado.DB = W.CrmRemoto.paraCargar(); },
    ocupado: () => estado.ocupado,
    equipo: () => !!o.equipo
  };
  return { W, C: W.CrmRemoto, almacen, porId, tarjeta, principal, nube, estado, ganchos, abiertas, recargas, oyentesDoc,
    correr() { while (pendientes.length) pendientes.shift().f(); },
    avanzar(ms) { reloj += ms; },
    async entrarBien() {
      porId.crCorreo.value = 'dueno@ejemplo.co'; porId.crClave.value = 'la-buena';
      porId.crPuerta.dispatch('submit', { preventDefault() {} });
      await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    } };
}
const quieta = () => new Promise(r => setImmediate(r));

describe('crm-remoto · la puerta y las rejas', () => {
  test('en un computador la pieza no hace NADA: ni puerta, ni oyentes, ni reja', () => {
    const p = pantalla({ navegador: PC });
    assert.equal(p.C.alAbrir(p.ganchos), 'pin');
    assert.equal(p.porId.crPuerta, undefined, 'no pinta la puerta del correo');
    assert.equal(p.oyentesDoc.length, 0, 'no escucha ningún toque');
    assert.equal(p.C.puertaDeCorreo(), false);
    assert.equal(p.C.activo(), false);
    p.W.localStorage.setItem(R.GAVETA, '{"socios":[]}');
    assert.equal(p.almacen[R.GAVETA], '{"socios":[]}', 'la gaveta del PC se escribe como siempre');
    assert.equal(p.nube._traidas.length, 0, 'ni le pregunta nada a la nube');
  });

  test('un computador con la ventana angosta sigue siendo el computador', () => {
    const p = pantalla({ navegador: PC_TACTIL });
    p.W.innerWidth = 390;
    assert.equal(p.C.alAbrir(p.ganchos), 'pin');
  });

  test('un celular que ya trajo la cartera conserva su puerta del PIN', () => {
    const p = pantalla({ almacen: { [R.GAVETA]: JSON.stringify({ socios: [{ id: 's1' }], prestamos: [] }) } });
    assert.equal(p.C.alAbrir(p.ganchos), 'copia');
    assert.equal(p.porId.crPuerta, undefined);
    assert.equal(p.C.puertaDeCorreo(), false);
  });

  test('en un celular sin cartera: celular y contraseña, y el PIN escondido', () => {
    const p = pantalla();
    assert.equal(p.C.alAbrir(p.ganchos), 'correo');
    assert.equal(p.C.puertaDeCorreo(), true);
    assert.ok(p.porId.crPuerta, 'pinta el formulario');
    assert.equal(p.porId.pinInput.padre.style.display, 'none', 'la caja del PIN se esconde');
    assert.equal(p.porId.pinBtn.style.display, 'none');
    assert.equal(p.porId.salidaPuerta.style.display, 'none', '«Traer mi cartera» ya no se ofrece aquí');
    const h = p.porId.crPuerta.innerHTML;
    assert.match(h, /autocomplete="current-password"/, 'para que el iPhone ofrezca la contraseña guardada');
    assert.match(h, /Entra con tu celular y tu contraseña/);
    assert.match(h, /id="crCorreo" name="username" type="tel" inputmode="tel"/, 'el campo es de celular');
    assert.match(h, /Queda abierto en este celular hasta que toques «Salir»/);
    assert.doesNotMatch(h, /medianoche/);
    assert.match(h, /solo se mira/);
    assert.ok(p.tarjeta.hijos.indexOf(p.porId.crPuerta) < p.tarjeta.hijos.findIndex(x => x.className === 'gate-link'), '«Soy del equipo» queda debajo');
    assert.equal(p.nube._traidas.length, 0, 'sin entrar no se trae nada');
  });

  test('con contraseña mala no entra y dice por qué; nada se trae', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    p.porId.crCorreo.value = 'dueno@ejemplo.co'; p.porId.crClave.value = 'otra';
    p.porId.crPuerta.dispatch('submit');
    await quieta(); await quieta();
    assert.match(p.porId.crErr.textContent, /No pude entrar: El correo o la contraseña no coinciden/);
    assert.equal(p.C.activo(), false);
    assert.equal(p.estado.abrio, 0);
    assert.equal(p.nube._traidas.length, 0);
  });

  test('con la buena: trae TODO, abre, y la cartera queda solo en la memoria', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    assert.deepEqual(p.nube._traidas, [null], 'la primera traída es completa');
    assert.equal(p.C.activo(), true);
    assert.equal(p.estado.abrio, 1);
    assert.equal(p.estado.DB.socios.length, 2);
    assert.equal(p.porId.crClave.value, '', 'la contraseña no se queda en el campo');
    assert.equal(p.almacen[R.GAVETA], undefined, 'la gaveta del CRM no existe');
    for (const k of Object.keys(p.almacen)) assert.ok(!p.almacen[k].includes('Camila'), 'ningún nombre queda en el disco (' + k + ')');
    assert.equal(JSON.parse(p.almacen[R.LLAVE_HASTA]).siempre, true, 'la marca de esta puerta queda puesta, sin fecha de vencimiento');
    assert.deepEqual(p.nube._config, R.CONEXION, 'la conexión viene puesta de fábrica');
  });

  test('si la nube no trae ninguna ficha NO abre: un CRM en $0 no es la cartera', async () => {
    const p = pantalla({ traer: () => Promise.resolve({ servidor_ahora: 'x', socios: [], creditos: [], respaldados: [], ajustes: [] }) });
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    assert.equal(p.C.activo(), false);
    assert.equal(p.estado.abrio, 0);
    assert.match(p.porId.crErr.textContent, /no trae ninguna ficha/);
  });

  test('si la traída falla NO abre, y dice que no pudo traer la cartera', async () => {
    const p = pantalla({ traer: () => Promise.reject({ motivo: 'La base contestó con un error.', estado: 500 }) });
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    assert.equal(p.C.activo(), false);
    assert.equal(p.estado.abrio, 0);
    assert.match(p.porId.crErr.textContent, /^No pude traer tu cartera: La base contestó/);
    assert.equal(p.nube._salidas, 0, 'un error de la base no cierra la sesión');
    assert.equal(p.porId.crReintentar.style.display, '', 'y se puede reintentar');
  });

  test('LA REJA DE LA GAVETA: con el CRM mirando, nadie escribe joan_socios_v1 por ningún camino', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    assert.throws(() => p.W.localStorage.setItem(R.GAVETA, '{"socios":[1]}'), /solo mira/);
    assert.equal(p.almacen[R.GAVETA], undefined);
    /* Lo demás del navegador se sigue pudiendo escribir. */
    p.W.localStorage.setItem('otra_cosa', 'x');
    assert.equal(p.almacen.otra_cosa, 'x');
  });

  test('WhatsApp no se abre desde aquí, ni cuando lo pide una acción de mirar', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    assert.equal(p.W.open('https://wa.me/573001112233?text=Hola'), null);
    assert.deepEqual(p.abiertas, []);
    p.W.open('../app/socio.html#v=abc', '_blank');
    assert.deepEqual(p.abiertas, ['../app/socio.html#v=abc'], 'lo que no escribe sí abre');
  });

  test('guardar(): una pintada calla; un toque que cambió algo se dice y la pantalla vuelve atrás', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    const bajar = p.oyentesDoc.find(x => x.t === 'pointerdown' && x.captura).f;
    /* Una pintada que guarda (renderVentas lo hace): nada que decir. */
    assert.equal(p.C.alGuardar(true), false);
    assert.equal(p.estado.repintadas.length, 0);
    /* Un toque que no cambió nada y un guardar() detrás: tampoco. */
    bajar({});
    assert.equal(p.C.alGuardar(false), false);
    p.correr();
    assert.equal(p.estado.repintadas.length, 0);
    /* Un toque que «cobra»: se niega, lo dice y repone lo de la nube. */
    bajar({});
    p.estado.DB.prestamos[0].pagado = true;
    assert.equal(p.C.alGuardar(false), false);
    assert.equal(p.estado.repintadas.length, 0, 'se repone DESPUÉS de que termine quien llamó');
    p.correr();
    assert.deepEqual(p.estado.repintadas, [true]);
    assert.equal(p.estado.DB.prestamos[0].pagado, false, 'el cobro que no existe ya no está a la vista');
    assert.equal(p.almacen[R.GAVETA], undefined);
  });

  test('el filtro de toques: lo que no es de mirar no corre', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    const tocar = p.oyentesDoc.find(x => x.t === 'click' && x.captura).f;
    const boton = codigo => ({ closest: sel => (sel === '[onclick]' ? { getAttribute: () => codigo } : null) });
    const toque = el => { const ev = { target: el, frenado: false, preventDefault() { this.frenado = true; }, stopImmediatePropagation() { this.parado = true; } }; tocar(ev); return ev; };
    assert.equal(toque(boton("verCliente('s1')")).frenado, false);
    assert.equal(toque(boton("nuevoCredito()")).frenado, true);
    assert.equal(toque(boton("abrirPago('c1')")).parado, true);
    /* Un enlace de WhatsApp, aunque no tenga onclick. */
    const enlace = { closest: sel => (sel === 'a[href]' ? { getAttribute: () => 'https://wa.me/573001112233' } : null) };
    assert.equal(toque(enlace).frenado, true);
    /* El selector de archivos (fotos, respaldos): ni se abre. */
    const archivo = { closest: sel => (sel === 'input[type="file"]' ? {} : null) };
    assert.equal(toque(archivo).frenado, true);
    /* Lo nuestro (la franja y su «Salir») pasa siempre. */
    const nuestro = { closest: sel => (sel === '[data-cr]' ? {} : sel === '[onclick]' ? { getAttribute: () => 'nuevoCredito()' } : null) };
    assert.equal(toque(nuestro).frenado, false);
  });

  test('antes de entrar el filtro no frena nada: la puerta del equipo sigue andando', () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    const tocar = p.oyentesDoc.find(x => x.t === 'click' && x.captura).f;
    const ev = { target: { closest: sel => (sel === '[onclick]' ? { getAttribute: () => 'entrarEquipo()' } : null) }, preventDefault() { this.frenado = true; }, stopImmediatePropagation() {} };
    tocar(ev);
    assert.equal(ev.frenado, undefined);
  });

  /* 24-nov-2026 — Joan: «solo quiero que sea ingresar con mi numero de celular y la
     contraseña… quiero que el CRM siempre este abierto en mi celular». */
  test('quién entra: un celular es la cuenta de ese celular; lo que lleva @ es un correo', () => {
    const C = require('../app/cuenta.js');
    assert.deepEqual(R.usuarioDeLaPuerta('300 111 2233', C), { correo: C.correoDeTelefono('3001112233'), conCorreo: false });
    assert.equal(R.usuarioDeLaPuerta('+57 300-111-2233', C).correo, C.correoDeTelefono('3001112233'), 'como la gente lo escribe');
    assert.deepEqual(R.usuarioDeLaPuerta(' dueno@ejemplo.co ', C), { correo: 'dueno@ejemplo.co', conCorreo: true });
    assert.match(R.usuarioDeLaPuerta('12345', C).error, /diez dígitos/);
    assert.match(R.usuarioDeLaPuerta('', C).error, /Falta tu celular/);
    assert.match(R.usuarioDeLaPuerta('3001112233', null).error, /recarga/, 'sin app/cuenta.js no se inventa el correo');
    assert.equal(R.celularDeSesion(C.correoDeTelefono('3001112233'), C), '3001112233');
    assert.equal(R.celularDeSesion('dueno@ejemplo.co', C), '', 'un correo no se pinta en el campo del celular');
    assert.equal(R.noEsDueno({ motivo: 'No se pudo', cuerpo: { message: 'no autorizado' } }), true);
    assert.equal(R.noEsDueno({ motivo: 'Sin conexión', sin_red: true }), false);
  });

  test('con celular y contraseña entra a la cuenta de ese celular', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    p.porId.crCorreo.value = '300 111 2233'; p.porId.crClave.value = 'la-buena';
    p.porId.crPuerta.dispatch('submit', { preventDefault() {} });
    await quieta(); await quieta();
    assert.equal(p.nube._sesion.correo, require('../app/cuenta.js').correoDeTelefono('3001112233'));
    assert.equal(p.C.activo(), true);
  });

  test('un celular a medias no llega a la nube: se dice y ya', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    p.porId.crCorreo.value = '30011'; p.porId.crClave.value = 'la-buena';
    p.porId.crPuerta.dispatch('submit', { preventDefault() {} });
    await quieta();
    assert.match(p.porId.crErr.textContent, /diez dígitos/);
    assert.equal(p.nube._sesion, null);
  });

  test('SIEMPRE ABIERTO: con la marca de esta puerta la sesión abre sola, sea de hoy o de hace un mes', async () => {
    const haceUnMes = new Date(2026, 9, 23, 10, 30, 0).getTime();
    for (const marca of [{ desde: haceUnMes, siempre: true }, { hasta: haceUnMes }]) {
      const p = pantalla({ sesion: { access_token: 't', correo: 'dueno@ejemplo.co' }, almacen: { [R.LLAVE_HASTA]: JSON.stringify(marca) } });
      p.C.alAbrir(p.ganchos);
      await quieta(); await quieta();
      assert.equal(p.C.activo(), true);
      assert.equal(p.estado.abrio, 1);
      assert.equal(p.nube._salidas, 0, 'nadie cierra la sesión por vieja');
    }
  });

  test('con el CRM abierto, pasar la medianoche no lo cierra', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    p.avanzar(30 * 3600000);
    p.porId.crActualizar.dispatch('click');
    await quieta(); await quieta();
    assert.equal(p.C.activo(), true);
    assert.equal(p.nube._salidas, 0);
    assert.equal(p.recargas.length, 0);
  });

  test('sin señal al abrir: NO pide la contraseña otra vez; ofrece «Reintentar» y entra cuando vuelve', async () => {
    const p = pantalla({ sesion: { access_token: 't', correo: 'dueno@ejemplo.co' }, almacen: { [R.LLAVE_HASTA]: '{"siempre":true}' },
      traer: (desde, n) => (n === 1 ? Promise.reject({ motivo: 'Sin conexión.', sin_red: true }) : Promise.resolve(paquete())) });
    p.C.alAbrir(p.ganchos);
    await quieta(); await quieta();
    assert.equal(p.C.activo(), false);
    assert.match(p.porId.crErr.textContent, /Sin señal: no pude traer tu cartera/);
    assert.equal(p.porId.crReintentar.style.display, '', 'el botón de reintentar sale');
    assert.equal(p.nube._salidas, 0, 'la sesión sigue guardada');
    assert.ok(p.almacen[R.LLAVE_HASTA], 'y la marca también');
    p.porId.crReintentar.dispatch('click');
    await quieta(); await quieta();
    assert.equal(p.C.activo(), true, 'al reintentar entra, sin contraseña');
    assert.equal(p.estado.abrio, 1);
  });

  test('una cuenta que entra pero NO es dueña no se queda adentro, y se dice qué falta', async () => {
    /* Es la frase con la que nube.js traduce el «no autorizado» de panel_traer. */
    assert.match(LEER('panel/nube.js'), /no está en la lista de dueños/);
    const p = pantalla({ traer: () => Promise.reject({ motivo: 'Tu usuario entró bien, pero no está en la lista de dueños.', estado: 400 }) });
    p.C.alAbrir(p.ganchos);
    p.porId.crCorreo.value = '3001112233'; p.porId.crClave.value = 'la-buena';
    p.porId.crPuerta.dispatch('submit', { preventDefault() {} });
    await quieta(); await quieta(); await quieta();
    assert.equal(p.C.activo(), false);
    assert.equal(p.estado.abrio, 0);
    assert.match(p.porId.crErr.textContent, /no está autorizado como dueño/);
    assert.equal(p.nube._salidas, 1, 'no queda una sesión viva detrás de la puerta del dueño');
    assert.equal(p.almacen[R.LLAVE_HASTA], undefined);
  });

  test('una sesión que NO abrió esta puerta (la del Panel en el bolsillo) ni abre sola ni se cierra', async () => {
    const p = pantalla({ sesion: { access_token: 't', correo: 'dueno@ejemplo.co' } });
    p.C.alAbrir(p.ganchos);
    await quieta();
    assert.equal(p.C.activo(), false);
    assert.equal(p.nube._salidas, 0);
    assert.equal(p.porId.crCorreo.value, '', 'y su correo no se pinta en el campo del celular');
    const q = pantalla({ sesion: { access_token: 't', correo: require('../app/cuenta.js').correoDeTelefono('3001112233') } });
    q.C.alAbrir(q.ganchos);
    assert.equal(q.porId.crCorreo.value, '3001112233', 'el celular de una sesión de celular sí viene escrito');
  });

  test('«Salir» cierra la sesión de la nube, quita la marca y recarga', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    p.C.salir(false);
    await quieta(); await quieta();
    assert.equal(p.C.activo(), false);
    assert.equal(p.nube._salidas, 1);
    assert.equal(p.almacen[R.LLAVE_HASTA], undefined);
    assert.equal(p.recargas.length, 1);
    assert.equal(JSON.stringify(p.C.paraCargar()), '{}', 'de la cartera no queda nada');
  });
});

/* ------------------------------------------------------------------ 3 ----
   El crm.html de verdad, sin navegador (banco-panel.js). La pieza se le pone
   con lo mismo que le pregunta la página: activo, paraCargar y alGuardar. */
describe('crm.html · con la pieza activa no se escribe la gaveta', () => {
  const carteraDeLaNube = () => R.armar(null, paquete()).db;
  function abrirMirando() {
    const almacen = {};
    const b = abrirPanel({ almacen, ahora: '2026-11-23T15:30:00Z' });
    const llamadas = [];
    b.ctx.CrmRemoto = { activo: () => true, paraCargar: () => JSON.parse(JSON.stringify(carteraDeLaNube())),
      alGuardar: deFondo => { llamadas.push(deFondo); return false; }, puertaDeCorreo: () => false, pintarPuerta: () => false };
    return { b, almacen, llamadas };
  }

  test('control: sin la pieza, cargar() lee la gaveta y guardar() la escribe, como siempre', () => {
    const almacen = {};
    const b = abrirPanel({ almacen });
    b.cargarCartera({ socios: [{ id: 's9', numero: 9, nombre: 'Del Computador' }], prestamos: [] });
    assert.equal(b.ev('soloMirar()'), false);
    assert.equal(b.ev('DB.socios[0].nombre'), 'Del Computador');
    assert.equal(b.ev('guardar()'), true);
    assert.match(almacen[R.GAVETA], /Del Computador/);
  });

  test('cargar() saca la cartera de la memoria y le pone sus valores por defecto', () => {
    const { b, almacen } = abrirMirando();
    b.ev('DB=cargar()');
    assert.equal(b.ev('soloMirar()'), true);
    assert.equal(b.ev('DB.socios.length'), 2);
    assert.equal(b.ev('DB.prestamos.length'), 2);
    assert.equal(b.ev('DB.socios[0].nombre'), 'Camila Rojas');
    assert.equal(b.ev('Array.isArray(DB.papelera) && Array.isArray(DB.invitaciones)'), true, 'los valores por defecto de cargar() le aplican igual');
    assert.equal(almacen[R.GAVETA], undefined, 'y cargar no crea la gaveta');
  });

  test('guardar() no escribe y le pregunta a la pieza qué decir', () => {
    const { b, almacen, llamadas } = abrirMirando();
    b.ev('DB=cargar()');
    b.ev('DB.prestamos[0].pagado=true');
    assert.equal(b.ev('guardar()'), false);
    assert.equal(b.ev("guardar('de-fondo')"), false);
    assert.deepEqual(llamadas, [false, true], 'una vez como acción y otra como pintada');
    assert.equal(almacen[R.GAVETA], undefined, 'la gaveta sigue sin existir');
    assert.equal(almacen.joan_crm_sello, undefined, 'ni el sello de la cartera');
  });

  test('pintar todo el CRM con la cartera de la nube no escribe nada en el disco', () => {
    const { b, almacen } = abrirMirando();
    b.ev('abrirSoloMirar()');
    assert.equal(b.ev('_crmAbierto'), true);
    assert.equal(b.ev('DB.socios.length'), 2);
    assert.equal(almacen[R.GAVETA], undefined);
    assert.deepEqual(Object.keys(almacen).filter(k => /socios|espejo|sello/.test(k)), [], 'ni la gaveta, ni el espejo, ni el sello');
  });

  test('abrirSoloMirar no arranca la subida, ni los historiales, ni la sesión de 24 h', () => {
    const { b, almacen } = abrirMirando();
    let subio = 0, historiales = 0;
    b.ctx.NubeCRM = { configurar() { subio++; } };
    b.ctx.HistorialesAuto = { configurar() { historiales++; } };
    b.ev('abrirSoloMirar()');
    assert.equal(subio, 0, 'un celular que mira no sube la cartera');
    assert.equal(historiales, 0);
    assert.equal(b.ev('_oyendoCartera'), false, 'ni escucha a otras pestañas');
    assert.equal(almacen.joan_crm_sesion, undefined, 'ni abre la sesión del PIN');
  });

  test('repintarSoloMirar vuelve a lo de la nube: el cambio que no se guardó desaparece', () => {
    const { b } = abrirMirando();
    b.ev('abrirSoloMirar()');
    b.ev('DB.prestamos[0].pagado=true; DB.socios.push({id:"sx",nombre:"No Existe"})');
    b.ev('repintarSoloMirar(true)');
    assert.equal(b.ev('DB.prestamos[0].pagado'), false);
    assert.equal(b.ev('DB.socios.length'), 2);
  });

  test('con la puerta del correo, entrar() no abre nada: ni con el 1234 de fábrica', () => {
    const almacen = {};
    const b = abrirPanel({ almacen });
    b.ctx.CrmRemoto = { activo: () => false, puertaDeCorreo: () => true, pintarPuerta: () => true };
    b.elems.pinInput.value = '1234';
    b.ev('entrar()');
    assert.equal(b.ev('_crmAbierto'), false);
    /* Y el control: sin la pieza, ese mismo 1234 sí entra (es el CRM de siempre). */
    const c = abrirPanel({ almacen: {} });
    c.elems.pinInput.value = '1234';
    c.ev('entrar()');
    assert.equal(c.ev('_crmAbierto'), true);
  });

  test('la página pide la pieza después de nube.js, con su versión, y el service worker la guarda', () => {
    const i = CRM.indexOf('<script src="nube.js'), j = CRM.indexOf('<script src="crm-remoto.js?v=');
    assert.ok(i > 0 && j > i, 'crm-remoto.js va después de nube.js');
    const v = /<script src="crm-remoto\.js\?v=(\d+)"/.exec(CRM)[1];
    const sw = LEER('sw.js');
    assert.ok(sw.includes("'panel/crm-remoto.js?v=" + v + "'"), 'sw.js guarda panel/crm-remoto.js?v=' + v);
    const cache = Number(/const CACHE = 'tugarantia-v(\d+)'/.exec(sw)[1]);
    assert.ok(Number(v) <= cache, 'la versión de la pieza no va por delante de la del sitio');
  });
});

/* ------------------------------------------------------------------ 4 ----
   24-nov-2026 — lo que no se puede, no se ve. */
describe('crm-remoto · lo que no se puede, no se ve', () => {
  const q = R.queHacerConElControl;

  test('se esconde el botón que escribe; el que mira se queda', () => {
    assert.equal(q({ etiqueta: 'BUTTON', onclick: 'nuevoCredito()' }), 'esconder');
    assert.equal(q({ etiqueta: 'button', onclick: "abrirPago('p1')" }), 'esconder');
    assert.equal(q({ etiqueta: 'A', onclick: "abrirPago('p1')" }), 'esconder');
    assert.equal(q({ etiqueta: 'SPAN', esBoton: true, onclick: 'exportar()' }), 'esconder');
    assert.equal(q({ etiqueta: 'BUTTON', onclick: "verCliente('x')" }), '');
    assert.equal(q({ etiqueta: 'A', onclick: "event.stopPropagation();verCredito('p1')" }), '');
    assert.equal(q({ etiqueta: 'BUTTON' }), '', 'un botón sin onclick (el menú, la puerta, la franja) no se toca');
    assert.equal(q(null), '');
    assert.equal(q({}), '');
  });

  test('lo que NO es un control sigue mostrando su dato aunque su toque no corra', () => {
    assert.equal(q({ etiqueta: 'TR', onclick: "abrirPago('p1')" }), '');
    assert.equal(q({ etiqueta: 'DIV', onclick: 'accionNubeTodo()' }), '');
    assert.equal(q({ etiqueta: 'TD', onclick: 'borrarCredito(1)' }), '');
  });

  test('WhatsApp y subir archivos se esconden; llamar no', () => {
    assert.equal(q({ etiqueta: 'A', href: 'https://wa.me/573001112233?text=hola' }), 'esconder');
    assert.equal(q({ etiqueta: 'A', href: 'sms:3001112233' }), 'esconder');
    assert.equal(q({ etiqueta: 'A', href: 'tel:3001112233' }), '');
    assert.equal(q({ etiqueta: 'A', href: 'traer.html' }), '');
    assert.equal(q({ etiqueta: 'INPUT', tipo: 'file' }), 'esconder');
    assert.equal(q({ etiqueta: 'LABEL', conArchivo: true }), 'esconder');
  });

  test('una casilla que marca algo se esconde; un campo cuyo cambio no se oye se apaga', () => {
    assert.equal(q({ etiqueta: 'INPUT', tipo: 'checkbox', onchange: 'marcarCob(this)' }), 'esconder');
    assert.equal(q({ etiqueta: 'INPUT', tipo: 'checkbox', onclick: 'marcarCob(this)' }), 'esconder');
    assert.equal(q({ etiqueta: 'INPUT', tipo: 'checkbox', onchange: 'renderCobranzas()' }), '', 'una casilla que solo filtra se queda');
    assert.equal(q({ etiqueta: 'INPUT', tipo: 'checkbox' }), '');
    assert.equal(q({ etiqueta: 'SELECT', onchange: "asignarUno('s1')" }), 'aquietar');
    assert.equal(q({ etiqueta: 'TEXTAREA', oninput: "previewPlt('mora')" }), 'aquietar');
    assert.equal(q({ etiqueta: 'INPUT', tipo: 'text', oninput: 'renderClientes()', onchange: 'guardarAlgo()' }), 'aquietar', 'con uno solo que escriba, se apaga');
    assert.equal(q({ etiqueta: 'INPUT', tipo: 'search', oninput: 'renderClientes()' }), '', 'el buscador de una lista sigue sirviendo');
    assert.equal(q({ etiqueta: 'INPUT', tipo: 'search' }), '');
  });

  test('la regla del barrido es la MISMA del filtro de toques: no hay una segunda lista', () => {
    R.MIRAR.forEach(n => assert.equal(q({ etiqueta: 'BUTTON', onclick: n + '()' }), '', n + ' es de mirar: su botón se ve'));
    ['nuevoCredito', 'abrirPago', 'borrarCredito', 'editarCliente', 'exportar', 'unaFuncionQueNadieHaLeido'].forEach(n => {
      assert.equal(R.codigoDeMirar(n + '()'), false);
      assert.equal(q({ etiqueta: 'BUTTON', onclick: n + '()' }), 'esconder', n + ' no corre: su botón no se ve');
    });
  });

  test('los botones de escribir que crm.html trae fijos en sus encabezados son de los que se esconden', () => {
    /* «＋ Nuevo crédito» del Tablero y de Créditos no se vuelve a pintar nunca: lo tapa el
       barrido del arranque. Si un día dejara de ser un <button onclick>, seguiría a la vista. */
    const fijos = Array.from(CRM.matchAll(/<button class="btn btn-rojo" onclick="(nuevoCredito\(\))">/g));
    assert.ok(fijos.length >= 2, 'hay al menos dos «＋ Nuevo crédito» fijos');
    fijos.forEach(m => assert.equal(q({ etiqueta: 'BUTTON', esBoton: true, onclick: m[1] }), 'esconder'));
  });

  test('el botón del menú de una pestaña tapada lleva su marca, y los estilos la pintan', () => {
    const fuente = LEER('panel/crm-remoto.js');
    assert.match(fuente, /classList\.add\('cr-en-pc'\)/);
    assert.match(fuente, /body\.solo-mirar \.navbtn\.cr-en-pc::after\{content:"PC"/);
    assert.match(fuente, /body\.solo-mirar \.cr-no\{display:none !important\}/);
  });

  test('con el CRM mirando, lo recién pintado se barre antes de que se vea (el vigía)', () => {
    const fuente = LEER('panel/crm-remoto.js');
    assert.match(fuente, /new W\.MutationObserver/);
    assert.match(fuente, /observe\(D\.body, \{ childList: true, subtree: true \}\)/);
    /* Y lo que la página trae escrito desde el HTML se barre una vez, al abrir. */
    const abrir = fuente.slice(fuente.indexOf('function abrirDesdeLaNube'), fuente.indexOf('function arrancarRelojes'));
    assert.ok(abrir.indexOf('ponerVigiaDelBarrido()') < abrir.indexOf('E.ganchos.abrir()'), 'el vigía se pone antes de pintar');
    assert.ok(abrir.indexOf('barrer(D)') > abrir.indexOf('E.ganchos.abrir()'), 'y el barrido entero va después');
  });
});

/* ==========================================================================
 * 24-nov-2026 — EL CELULAR QUE GUARDA UNA COPIA (la puerta 'copia')
 * Si alguna vez se trajo la cartera a un teléfono, su PIN abre esa copia, la de
 * aquel día, y nada lo decía. Ahora lo dice (en la puerta y, con el CRM ya
 * abierto, en una franja) y ofrece «Ver lo de hoy»: la cartera de la nube, para
 * mirar. La copia no se toca. Y lo que Joan escoja se recuerda en ese aparato.
 * ======================================================================== */
describe('crm-remoto · el celular que guarda una copia', () => {
  const COPIA = JSON.stringify({ socios: [{ id: 's1', nombre: 'Persona De Mentira' }], prestamos: [] });
  const HOY = 'joan_crm_ver_hoy', MARCA = 'joan_crm_remoto';
  const conCopia = extra => pantalla(Object.assign({ almacen: Object.assign({ [R.GAVETA]: COPIA }, (extra && extra.almacen) || {}) },
    extra ? { sesion: extra.sesion } : {}));

  test('la puerta sigue siendo la del PIN, y ahora dice que es una copia y ofrece «Ver lo de hoy»', () => {
    const p = conCopia();
    assert.equal(p.C.alAbrir(p.ganchos), 'copia');
    assert.ok(p.porId.crCopia, 'no pinta el aviso de la copia');
    assert.match(p.porId.crCopia.innerHTML, /Este celular guarda una copia de tu cartera<\/b>, de cuando la trajiste\. No se actualiza sola/);
    assert.match(p.porId.crCopia.innerHTML, /<button type="button" class="cr-hoy" id="crHoy">Ver lo de hoy<\/button>/);
    assert.match(p.porId.crCopia.innerHTML, /es solo para mirar\. La copia de este celular no se toca\./);
    assert.notEqual(p.porId.pinBtn.style.display, 'none', 'escondió el PIN: con él se abre la copia');
    assert.equal(p.C.puertaDeCorreo(), false);
    assert.equal(p.oyentesDoc.length, 0, 'puso las rejas de mirar sobre una copia que se trabaja con PIN');
    assert.equal(p.nube._traidas.length, 0, 'le preguntó a la nube sin que nadie lo pidiera');
    p.correr();                                   // lo que quedó para «al soltar» no revienta
    /* Y crm.html vuelve a pedirla cuando repone la tarjeta: no se duplica, y contesta false. */
    assert.equal(p.C.pintarPuerta(), false);
  });

  test('«Ver lo de hoy» en la puerta: pasa a celular y contraseña, lo recuerda, y la copia queda intacta', async () => {
    const p = conCopia();
    p.C.alAbrir(p.ganchos);
    p.porId.crHoy.dispatch('click');
    assert.ok(p.almacen[HOY], 'no recordó que Joan quiere ver lo de hoy');
    assert.equal(p.C.puertaDeCorreo(), true);
    assert.ok(p.porId.crPuerta, 'no pintó la puerta del celular y la contraseña');
    assert.match(p.porId.crPuerta.innerHTML, /id="crVolverCopia">Volver a la copia de este celular</, 'no deja volver a la copia');
    assert.equal(p.porId.pinBtn.style.display, 'none', 'el PIN quedó a la vista junto a la otra puerta');
    assert.equal(p.recargas.length, 0, 'en la puerta no hace falta recargar');
    await p.entrarBien();
    assert.equal(p.C.activo(), true, 'no abrió mirando desde la nube');
    assert.equal(p.estado.abrio, 1);
    assert.equal(p.almacen[R.GAVETA], COPIA, 'mirar lo de hoy tocó la copia del celular');
    assert.throws(() => p.W.localStorage.setItem(R.GAVETA, '{}'), 'mirando, la gaveta se pudo escribir');
    assert.equal(p.almacen[R.GAVETA], COPIA);
  });

  test('la próxima vez abre directo lo de hoy: sin PIN y sin volver a preguntar', async () => {
    const p = conCopia({ almacen: { [HOY]: '1', [MARCA]: JSON.stringify({ desde: 1, siempre: true }) },
      sesion: { access_token: 'tok', refresh_token: 'ref', correo: '573001112233@tugarantia.net' } });
    assert.equal(p.C.alAbrir(p.ganchos), 'correo');
    assert.equal(p.porId.crCopia, undefined, 'volvió a ofrecer la copia a quien ya escogió');
    await quieta(); await quieta();
    assert.equal(p.C.activo(), true, 'con la sesión abierta no entró solo');
    assert.equal(p.almacen[R.GAVETA], COPIA);
  });

  test('«Volver a la copia de este celular» olvida la preferencia y recarga: vuelve la puerta del PIN', () => {
    const p = conCopia({ almacen: { [HOY]: '1' } });
    assert.equal(p.C.alAbrir(p.ganchos), 'correo');
    p.porId.crVolverCopia.dispatch('click');
    assert.equal(p.almacen[HOY], undefined, 'la preferencia se quedó');
    assert.equal(p.recargas.length, 1);
    const q = pantalla({ almacen: p.almacen });
    assert.equal(q.C.alAbrir(q.ganchos), 'copia');
    assert.equal(q.almacen[R.GAVETA], COPIA);
  });

  test('con el CRM ya abierto sobre la copia (el PIN se retomó solo): una franja lo dice, y «Ver lo de hoy» recarga', () => {
    const p = conCopia();
    p.C.alAbrir(p.ganchos);
    /* La puerta a la vista: sin franja. */
    p.porId.gate = { style: { display: '' } };
    assert.equal(p.C.revisarFranjaDeCopia(), false);
    assert.equal(p.porId.crFranjaCopia, undefined);
    /* La puerta escondida: el CRM está abierto con la copia. */
    p.porId.gate.style.display = 'none';
    assert.equal(p.C.revisarFranjaDeCopia(), true);
    const f = p.porId.crFranjaCopia;
    assert.ok(f && p.principal.hijos[0] === f, 'la franja no va arriba de todo');
    assert.match(f.innerHTML, /📱 Copia de este celular<\/b>.*Es de cuando la trajiste: no se actualiza sola\./);
    assert.equal(p.C.revisarFranjaDeCopia(), true);
    assert.equal(p.principal.hijos.filter(x => x.id === 'crFranjaCopia').length, 1, 'la franja se duplicó');
    p.porId.crHoyAdentro.dispatch('click');
    assert.ok(p.almacen[HOY]);
    assert.equal(p.recargas.length, 1, 'adentro hay que recargar: el CRM abierto escribe sobre la copia');
    assert.equal(p.C.activo(), false, 'se puso a mirar sin recargar, con la copia cargada en la página');
    assert.equal(p.almacen[R.GAVETA], COPIA);
  });

  test('a quien no tiene copia no se le habla de copias', () => {
    const p = pantalla();
    assert.equal(p.C.alAbrir(p.ganchos), 'correo');
    assert.equal(p.porId.crCopia, undefined);
    assert.equal(/crVolverCopia/.test(p.porId.crPuerta.innerHTML), false);
    assert.equal(p.C.revisarFranjaDeCopia(), false);
    /* Ni al computador, tenga la cartera que tenga. */
    const pc = pantalla({ navegador: PC, almacen: { [R.GAVETA]: COPIA, [HOY]: '1' } });
    assert.equal(pc.C.alAbrir(pc.ganchos), 'pin');
    assert.equal(pc.porId.crCopia, undefined);
    assert.equal(pc.porId.crPuerta, undefined);
  });

  test('crm.html: la tarjeta repuesta vuelve a pedir la puerta (también la de la copia), y el PIN no abre con la del correo', () => {
    const puerta = CRM.slice(CRM.indexOf('function pintarSalidaDeLaPuerta()'), CRM.indexOf('function pintarSalidaDeLaPuerta()') + 900);
    assert.match(puerta, /try \{ if \(window\.CrmRemoto && CrmRemoto\.pintarPuerta\(\)\) return; \} catch \(e\) \{\}/);
    assert.match(CRM, /function entrar\(\)\{[\s\S]{0,400}?try\{ if\(window\.CrmRemoto && CrmRemoto\.puertaDeCorreo\(\)\) return; \}catch\(e\)\{\}/,
      'con «Ver lo de hoy» escogido, el PIN guardado abriría la copia por debajo de la puerta del correo');
  });
});

/* ==========================================================================
 * 24-nov-2026 — DEL CRM DEL CELULAR AL PANEL EN EL BOLSILLO
 * Desde que «Soy Joan» trae al celular hasta el CRM (panel/index.html), el CRM
 * es lo primero que abre, y ahí solo se mira. El sitio donde SÍ se registra un
 * cobro en la calle tiene que quedar a un toque: en la puerta y en la franja.
 * ======================================================================== */
describe('crm-remoto · el camino al Panel en el bolsillo', () => {
  test('la puerta lo ofrece antes de entrar, con un enlace de verdad', () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    assert.match(p.porId.crPuerta.innerHTML, /¿Vas a registrar un cobro\? <a id="crAlBolsillo" href="espejo\.html">Abre el Panel en el bolsillo<\/a>/);
  });
  test('adentro, la franja lleva «Cobrar»: un enlace (href), no un onclick que el filtro de mirar frenaría', async () => {
    const p = pantalla();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    assert.equal(p.C.activo(), true);
    const h = p.porId.crFranja.innerHTML;
    assert.match(h, /<a class="cr-ir" id="crCobrar" href="espejo\.html"[^>]*>Cobrar<\/a>/);
    assert.equal(/id="crCobrar"[^>]*onclick/.test(h), false);
    assert.ok(h.indexOf('id="crCobrar"') < h.indexOf('id="crActualizar"') && h.indexOf('id="crActualizar"') < h.indexOf('id="crSalir"'), 'el orden de los tres controles cambió');
    assert.equal(p.porId.crFranja.getAttribute('data-cr'), '1', 'sin data-cr, el filtro de toques trataría el enlace como del CRM');
  });
  test('la franja de la COPIA no lo lleva: ahí el CRM escribe y cobrar se hace ahí mismo', () => {
    const p = pantalla({ almacen: { [R.GAVETA]: JSON.stringify({ socios: [{ id: 's1' }], prestamos: [] }) } });
    p.C.alAbrir(p.ganchos);
    p.porId.gate = { style: { display: 'none' } };
    p.C.revisarFranjaDeCopia();
    assert.equal(/crCobrar/.test(p.porId.crFranjaCopia.innerHTML), false);
  });
  test('en el teléfono, la rejilla de la franja tiene sitio para los tres, a 44 px', () => {
    const js = LEER('panel/crm-remoto.js');
    assert.match(js, /\.cr-franja\{display:grid;grid-template-columns:minmax\(0,1fr\) auto auto auto;/);
    assert.match(js, /\.cr-franja button,\.cr-franja a\.cr-ir\{grid-row:1\/3;min-height:44px;/);
  });
});

/* ==========================================================================
 * 24-nov-2026 — LO QUE NO SUBE SOLO DICE SU FECHA
 * Las plantillas y el equipo llegan a la nube solo cuando Joan toca ☁ Subir en
 * su computador (nube-crm.js sube solas las fichas, los créditos y tres listas).
 * En el celular podían ser de hace meses sin que nada lo dijera.
 * ======================================================================== */
describe('crm-remoto · Plantillas y Equipo dicen de qué día son', () => {
  const AGO = '2026-08-18T15:00:00Z';
  test('la fecha sale del paquete; una traída parcial sin esa fila deja la que había', () => {
    const f = R.fechasDeAjustes({ ajustes: [{ clave: 'plantillas', actualizado_en: AGO }, { clave: 'equipo', actualizado_en: '2026-11-20T12:00:00Z' }] }, null);
    assert.deepEqual(f, { plantillas: AGO, equipo: '2026-11-20T12:00:00Z' });
    const g = R.fechasDeAjustes({ ajustes: [{ clave: 'equipo', actualizado_en: '2026-11-24T12:00:00Z' }] }, f);
    assert.deepEqual(g, { plantillas: AGO, equipo: '2026-11-24T12:00:00Z' });
    assert.deepEqual(R.fechasDeAjustes({}, f), f);
    assert.deepEqual(R.fechasDeAjustes(null, null), {});
  });
  test('la frase dice el día con su año, y que allá hay que tocar ☁ Subir; sin fecha, lo dice igual sin inventarla', () => {
    assert.equal(R.notaDeFecha('plantillas', { plantillas: AGO }),
      'Estas plantillas son las que subiste a la nube el 18 de ago de 2026. Lo que cambies allá no sube solo todavía: toca ☁ Subir en tu computador para verlo aquí.');
    assert.match(R.notaDeFecha('equipo', { equipo: '2026-11-20T17:00:00Z' }), /^Este equipo es el que subiste a la nube el 20 de nov de 2026\./);
    assert.match(R.notaDeFecha('equipo', {}), /^Este equipo es el de la última vez que tocaste ☁ Subir en tu computador\./);
    assert.equal(/undefined|NaN|Invalid/.test(R.notaDeFecha('plantillas', { plantillas: 'no es una fecha' })), false);
    ['dash', 'cred', 'clientes', 'cobranzas', 'socios', ''].forEach(v => assert.equal(R.notaDeFecha(v, { plantillas: AGO }), '', v + ' sube sola: no lleva nota'));
  });
  test('las dos listas que llevan nota son justo las que el computador NO sube solo', () => {
    const subenSolas = /var CLAVES_QUE_SUBEN = \[([^\]]+)\]/.exec(LEER('panel/nube-crm.js'))[1];
    ['plantillas', 'equipo'].forEach(k => {
      assert.equal(subenSolas.indexOf("'" + k + "'"), -1, k + ' ya sube sola: su nota de «toca ☁ Subir» miente y hay que quitarla');
      assert.ok(R.CLAVES_QUE_PASAN.indexOf(k) >= 0, k + ' ya no llega al celular');
    });
  });
  test('al entrar, cada pestaña la lleva debajo de su título; y se pone al día si llega una subida nueva', async () => {
    let vez = 0;
    const p = pantalla({ traer: () => {
      vez++;
      const paq = paquete();
      paq.ajustes = (paq.ajustes || []).filter(a => a.clave !== 'plantillas')
        .concat([{ clave: 'plantillas', datos: {}, revision: vez, actualizado_en: vez === 1 ? AGO : '2026-11-24T15:00:00Z', actualizado_por: 'computador' }]);
      return Promise.resolve(paq);
    } });
    ['plantillas', 'equipo'].forEach(v => {
      const vista = p.W.document.createElement('section'); vista.id = 'v-' + v;
      const cabeza = p.W.document.createElement('div'); cabeza.className = 'ph'; vista.appendChild(cabeza);
      vista.appendChild(p.W.document.createElement('div'));
    });
    p.C.alAbrir(p.ganchos);
    await p.entrarBien();
    const n = p.porId['crFecha-plantillas'];
    assert.ok(n, 'Plantillas no lleva su nota');
    assert.equal(p.porId['v-plantillas'].hijos[1], n, 'la nota no va justo debajo del título');
    assert.match(n.textContent, /subiste a la nube el 18 de ago de 2026/);
    assert.equal(n.getAttribute('data-cr'), '1');
    assert.ok(p.porId['crFecha-equipo'], 'Equipo no lleva su nota');
    /* Joan toca ☁ Subir en el computador; el celular vuelve a mirar. */
    p.porId.crActualizar.dispatch('click');
    await quieta(); await quieta();
    assert.match(p.porId['crFecha-plantillas'].textContent, /subiste a la nube el 24 de nov de 2026/, 'la nota se quedó con la fecha vieja');
    assert.equal(p.porId['v-plantillas'].hijos.filter(x => x.id === 'crFecha-plantillas').length, 1, 'la nota se duplicó');
  });
});

/* ==========================================================================
 * 24-nov-2026 — 📥 REGISTRADOS EN EL CELULAR, MIRANDO
 * Joan: «tanto para crm de pc como de celular… quiero que se vea la hora y
 * fecha de registro». Se pregunta con la SESIÓN del dueño (panel_registros, la
 * del Panel en el bolsillo), nunca con la clave del computador, y se pinta en
 * una lista propia. Las fotos y los datos completos no llegan: se dice.
 * ======================================================================== */
describe('crm-remoto · 📥 Registrados en el celular', () => {
  const AHORA = new Date(2026, 10, 24, 10, 30, 0).getTime();
  const plano = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
  const ANA = { id: 1, nombre: 'Ana De Mentira', cedula: '52000001', telefono: '+57 300 111 2233', creado_en: new Date(2026, 10, 24, 9, 21).toISOString(),
    ciudad: 'Bogotá', barrio: 'Kennedy', cotejo: { estado: 'no_cuadra' }, pedido: { monto: 300000, producto: 'quincenal', nota: 'para el arriendo' } };
  const BETO = { id: 2, nombre: '<b>Beto</b>', cedula: '52000002', telefono: '123', creado_en: new Date(2026, 10, 23, 18, 40).toISOString(), app: 'platachat', cotejo: {} };
  const RESPUESTA = { servidor_ahora: new Date(AHORA - 60000).toISOString(), estado: 'nuevo', nuevos: 2, pedidos_leidos: true, registros: [ANA, BETO] };

  test('cada persona dice el DÍA Y LA HORA en que se registró, de dónde, y lo que pidió', () => {
    const t = plano(R.tarjetaDeRegistro(ANA, { ahora: AHORA, pedidosLeidos: true }));
    assert.match(t, /Ana De Mentira Se registró hoy, 9:21 a\. m\. · Bogotá · Kennedy/);
    assert.match(t, /No cuadra con el código de su cédula/);
    assert.match(t, /Pidió \$300\.000 · quincenal «para el arriendo»/);
    assert.match(t, /Celular 300 111 2233 · Llamar/);
    assert.match(plano(R.tarjetaDeRegistro(BETO, { ahora: AHORA, pedidosLeidos: true })), /Se registró ayer, 6:40 p\. m\./);
    assert.match(R.tarjetaDeRegistro(ANA, { ahora: AHORA }), /href="tel:\+573001112233"/);
  });
  test('no enseña la cédula, no escribe por WhatsApp, y lo que llega de la base sale escapado', () => {
    const h = R.tarjetaDeRegistro(ANA, { ahora: AHORA }) + R.tarjetaDeRegistro(BETO, { ahora: AHORA });
    assert.equal(/52000001|52000002/.test(h), false, 'la cédula quedó a la vista en la lista del celular');
    assert.equal(/wa\.me|whatsapp/i.test(h), false);
    assert.equal(/<b>Beto<\/b>/.test(h), false, 'un nombre con etiquetas se pintó como HTML');
    assert.match(h, /&lt;b&gt;Beto&lt;\/b&gt;/);
    assert.equal(/onclick=/.test(h), false);
  });
  test('«Pidió» es solo lo que la persona pidió; sin solicitud a la vista se dice, y si no se pudieron leer, se calla', () => {
    assert.match(plano(R.tarjetaDeRegistro(Object.assign({}, ANA, { pedido: { producto: 'respaldado' } }), { ahora: AHORA })), /Pidió un crédito · con garantía/);
    assert.match(plano(R.tarjetaDeRegistro(BETO, { ahora: AHORA, pedidosLeidos: true })), /No le veo ninguna solicitud de crédito\./);
    assert.equal(/solicitud/.test(plano(R.tarjetaDeRegistro(BETO, { ahora: AHORA, pedidosLeidos: false }))), false, 'dijo «no pidió» sin haber podido mirar');
  });
  test('las píldoras salen solo cuando dicen algo, con las palabras del Panel en el bolsillo; y «ya es tu cliente» si la cartera lo dice', () => {
    assert.deepEqual(R.chipsDeRegistro({ cotejo: {} }), []);
    assert.deepEqual(R.chipsDeRegistro({ cotejo: { estado: 'no_cuadra', menor: true, cedula_repetida: true }, app: 'platachat' }),
      ['Su cédula dice que es menor de edad', 'Cédula repetida', 'PlataChat']);
    assert.deepEqual(R.chipsDeRegistro({ cotejo: { documento_imposible: true, estado: 'no_cuadra' } }), ['Marcó otro documento']);
    const ESPEJO = LEER('panel/espejo.html');
    ['Su cédula dice que es menor de edad', 'Marcó otro documento', 'No cuadra con el código de su cédula', 'Cédula repetida'].forEach(p =>
      assert.ok(ESPEJO.indexOf(p) >= 0, 'el Panel en el bolsillo ya no dice «' + p + '»: las dos pantallas tienen que decir lo mismo'));
    assert.match(plano(R.tarjetaDeRegistro(ANA, { ahora: AHORA, cruce: () => 'Ya es tu cliente: CL-0021' })), /Ya es tu cliente: CL-0021/);
    assert.equal(/undefined/.test(R.tarjetaDeRegistro(ANA, { ahora: AHORA, cruce: () => { throw new Error('x'); } })), false);
  });
  test('la lista dice su estado: mirando, nadie, cuántos, y que las fotos y los datos se miran en el computador', () => {
    assert.match(plano(R.listaDeRegistrados({ estado: 'cargando', filas: [] }, { ahora: AHORA })), /Mirando quién se registró…/);
    const ok = plano(R.listaDeRegistrados({ estado: 'ok', filas: [ANA, BETO], nuevos: 2, pedidosLeidos: true, leidoEn: AHORA - 60000 }, { ahora: AHORA }));
    assert.match(ok, /2 personas esperando La nube contestó hoy, 10:29 a\. m\. ↻ Volver a mirar/);
    assert.match(ok, /Sus fotos, todos sus datos y la revisión se miran en tu computador \(📥 Registrados\)\. Para juntar su cuenta desde el celular, abre el Panel en el bolsillo/);
    assert.match(plano(R.listaDeRegistrados({ estado: 'ok', filas: [], nuevos: 0, leidoEn: AHORA }, { ahora: AHORA })), /Nadie esperando: no hay registros nuevos\./);
    assert.match(plano(R.listaDeRegistrados({ estado: 'ok', filas: [ANA], nuevos: 140, leidoEn: AHORA }, { ahora: AHORA })),
      /140 personas esperando .*Se ven los 1 más recientes de 140\. Los demás, en el computador\./);
    assert.match(plano(R.listaDeRegistrados({ estado: 'ok', filas: [ANA], nuevos: 1, leidoEn: AHORA }, { ahora: AHORA })), /^ ?1 persona esperando/);
  });
  test('no poder preguntar NO es «nadie»: sin señal o con error se dice, y la lista que había se queda; sin el SQL dice cuál correr', () => {
    const sin = plano(R.listaDeRegistrados({ estado: 'error', sinRed: true, filas: [ANA], nuevos: 1, leidoEn: AHORA - 3600000 }, { ahora: AHORA }));
    assert.match(sin, /Sin señal: no pude mirar quién se registró\. Eso no quiere decir que no haya nadie\. Abajo va la lista de la última vez que contestó la nube\./);
    assert.match(sin, /Ana De Mentira/);
    const err = plano(R.listaDeRegistrados({ estado: 'error', error: 'Supabase respondió 500: x', filas: [] }, { ahora: AHORA }));
    assert.match(err, /No pude mirar quién se registró\. Supabase respondió 500: x Eso no quiere decir que no haya nadie\./);
    assert.equal(/Nadie esperando|0 personas/.test(err), false, 'un fallo se pintó como «no hay nadie»');
    const falta = plano(R.listaDeRegistrados({ estado: 'falta', filas: [] }, { ahora: AHORA }));
    assert.match(falta, /Tu base todavía no tiene esta parte\. Corre base\/20261002_panel_registros\.sql/);
    assert.ok(fs.existsSync(path.join(RAIZ, 'base', '20261002_panel_registros.sql')), 'el archivo que se nombra no existe');
  });

  /* La pieza con su pantalla de mentira y una nube que anota cada pregunta. */
  function conRegistrados(respuesta) {
    const preguntas = [];
    const p = pantalla({ nube: { rpc(fn, c) { preguntas.push({ fn, c }); return typeof respuesta === 'function' ? respuesta(preguntas.length) : Promise.resolve(respuesta); } } });
    const vista = p.W.document.createElement('section'); vista.id = 'v-registrados';
    const cabeza = p.W.document.createElement('div'); cabeza.className = 'ph'; vista.appendChild(cabeza);
    const deCrm = p.W.document.createElement('div'); deCrm.id = 'tblRegistros'; vista.appendChild(deCrm);
    return { p, preguntas, vista };
  }
  test('al entrar pregunta con la sesión del dueño (panel_registros), pinta bajo el título y deja tapado lo que pinta crm.html', async () => {
    const { p, preguntas, vista } = conRegistrados(RESPUESTA);
    const antes = Object.keys(p.almacen).filter(k => k !== 'joan_crm_remoto').sort().join();
    p.C.alAbrir(p.ganchos);
    await p.entrarBien(); await quieta(); await quieta();
    /* Por JSON: lo que arma la pieza nace en otro contexto (vm) y deepEqual estricto mira el prototipo. */
    assert.equal(JSON.stringify(preguntas), JSON.stringify([{ fn: 'panel_registros', c: { p_estado: 'nuevo', p_limite: 100 } }]));
    const c = p.porId.crRegistrados;
    assert.ok(c && vista.hijos[1] === c, 'la lista no va justo debajo del título');
    assert.match(plano(c.innerHTML), /2 personas esperando .*Ana De Mentira Se registró /);
    assert.ok(vista._clases.has('cr-tapada'), 'lo de crm.html («Conéctala en Ajustes») quedaría a la vista');
    assert.ok(c.className.split(' ').includes('cr-tapa'), 'la regla que tapa la vista escondería también la lista');
    assert.equal(c.getAttribute('data-cr'), '1', 'sin data-cr el filtro de toques frenaría «↻ Volver a mirar»');
    /* Nada de los registrados queda en el disco del teléfono. */
    assert.equal(Object.keys(p.almacen).filter(k => /Ana De Mentira|3001112233/.test(String(p.almacen[k]))).length, 0, 'un registrado quedó guardado en el celular');
    assert.equal(Object.keys(p.almacen).filter(k => k !== 'joan_crm_remoto').sort().join(), antes, 'apareció una llave nueva en el disco');
  });
  test('«↻ Volver a mirar» pregunta otra vez; y la tapa vieja de Registrados ya no existe', async () => {
    const { p, preguntas } = conRegistrados(n => Promise.resolve(n === 1 ? RESPUESTA : Object.assign({}, RESPUESTA, { nuevos: 1, registros: [BETO] })));
    p.C.alAbrir(p.ganchos);
    await p.entrarBien(); await quieta(); await quieta();
    p.porId.crRegMirar.dispatch('click');
    await quieta(); await quieta();
    assert.equal(preguntas.length, 2);
    assert.match(plano(p.porId.crRegistrados.innerHTML), /1 persona esperando/);
    assert.equal(R.TAPAS.registrados, undefined);
    assert.deepEqual(Object.keys(R.TAPAS).sort(), ['bases', 'cfg', 'mensajes', 'solicitudes', 'ventas']);
    /* Y «🔎 Revisar a todos» (revision.html pregunta con la clave del computador) no queda a la vista. */
    assert.ok(LEER('panel/crm-remoto.js').indexOf("body.solo-mirar a[href=\"revision.html\"]{display:none !important}") > 0);
    assert.ok(CRM.indexOf('href="revision.html"') > 0, 'el enlace ya no existe en crm.html: la regla sobra');
  });
  test('si la nube falla, lo dice y no borra lo que ya se veía', async () => {
    const { p } = conRegistrados(n => n === 1 ? Promise.resolve(RESPUESTA) : Promise.reject({ motivo: 'Sin internet.', sin_red: true }));
    p.C.alAbrir(p.ganchos);
    await p.entrarBien(); await quieta(); await quieta();
    p.porId.crRegMirar.dispatch('click');
    await quieta(); await quieta();
    const t = plano(p.porId.crRegistrados.innerHTML);
    assert.match(t, /Sin señal: no pude mirar quién se registró\./);
    assert.match(t, /Ana De Mentira/);
  });
  test('NUNCA pregunta con la clave del computador: clave_ok cuenta los intentos de todos los aparatos', () => {
    const codigo = LEER('panel/crm-remoto.js').replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
    assert.equal(/p_clave|listar_registros|archivos_de_registro|registros_quien_ve|registro_vivo_joan/.test(codigo), false);
    assert.match(codigo, /N\.rpc\('panel_registros', \{ p_estado: 'nuevo', p_limite: LIMITE_REGISTRADOS \}\)/);
    /* Y la función existe con la sesión del dueño, no con anon. */
    const sql = LEER('base/20261002_panel_registros.sql');
    assert.match(sql, /create or replace function public\.panel_registros\(p_estado text default 'nuevo', p_limite integer default 100\)/);
    assert.match(sql, /panel_es_dueno\(\)/);
  });
});
