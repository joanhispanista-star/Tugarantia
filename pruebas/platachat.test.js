/* ============================================================================
 * PLATACHAT, EL CABLEADO — fase 1a, 14 de septiembre de 2026.
 *
 *   node --test            (desde la raíz; descubre pruebas/*.test.js)
 *
 * PlataChat la construyeron cinco sesiones en paralelo, cada una su pieza:
 * reglas, pagos, base, página y piel. Cada pieza trae sus propias pruebas.
 * Lo que NINGUNA puede probar es que las piezas encajen entre sí — y ahí es
 * donde este proyecto ha pagado sus defectos caros: el chat que llevaba tres
 * semanas en la base sin una pantalla que lo llamara; la función `fila` que se
 * fue con una tarjeta borrada y dejó play/ en blanco compilando perfecto; los
 * .mc-back que vivían en la hoja de una pantalla y salían rotos en las otras.
 *
 * Así que esto no prueba reglas: prueba CABLES. Nueve baterías, y cada una
 * contesta una pregunta que un cable suelto dejaría sin respuesta:
 *
 *  1. ¿El cliente ve porcentajes? (el centinela de motor.test.js, extendido)
 *  2. ¿El chat es el archivo compartido, o una segunda copia?
 *  3. ¿Carga los ocho archivos, en el orden en que uno necesita al otro?
 *  4. ¿Compila todo el JavaScript de la página?
 *  5. ¿PINTA de verdad, con una cuenta de prueba, los números que promete?
 *  6. ¿Llama a la base por nombres que EXISTEN en base/*.sql?
 *  7. ¿Pide algún permiso de los prohibidos?
 *  8. ¿El manifiesto y el envoltorio de Android apuntan a archivos reales?
 *  9. ¿La piel define cada token que la página usa?
 * 10. ¿Lo que la auditoría adversaria del 14-sep dejó clavado sigue clavado?
 *     (un solo latido, el gerente es una persona, la nube caída no es «sin
 *     conexión», un solo dueño de cada pieza de la piel, y la receta para
 *     los archivos ajenos existe)
 *
 * Los archivos bajo prueba son de este proyecto (platachat/*, descargas/
 * platachat.html, android/twa-platachat.json). Si una prueba de acá se cae,
 * se arregla el archivo, no la prueba.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

const PAGINA = leer('platachat/index.html');
const SESION_JS = leer('platachat/sesion.js');
const ESTILO = leer('platachat/estilo.css');

const M = require('../app/motor.js');
const U = require('../app/cuenta.js');
const CHAT = require('../app/chat.js');

/* Blanquea un trozo conservando los saltos de línea, para que los números de
   línea de un hallazgo sigan siendo los del archivo. */
const blanquear = (s, re) => s.replace(re, m => m.replace(/[^\n]/g, ' '));
const sinComentarios = s => blanquear(blanquear(s, /<!--[\s\S]*?-->/g), /\/\*[\s\S]*?\*\//g);

/* Las siete funciones de la base que PlataChat tiene que llamar, y con las
   que la página promete al cliente entrar, juntar su historial, chatear,
   registrarse, contar el acceso y mandar su comprobante. */
const RPC_OBLIGATORIAS = ['mi_cuenta', 'vincular_cuenta', 'chat_leer_sesion', 'chat_escribir_sesion',
                          'registrar_abierto_app', 'marcar_acceso', 'chat_foto_sesion'];

/* Los ocho archivos que carga index.html, en el orden del contrato. El orden
   importa: ficha.js toma MotorReglas al cargar, sesion.js toma CuentaSocio,
   y la página toma los siete por window.* en su primera línea. Uno fuera de
   sitio es un `undefined` que no revienta al cargar y sí al tocar la
   pantalla. (15-sep: entra ../app/ficha.js justo después del motor, y con él
   la página deja de copiar la aritmética de la ficha.) */
const SCRIPTS_EN_ORDEN = ['../app/motor.js', '../app/ficha.js', '../app/puente.js', '../app/cuenta.js', '../app/chat.js',
                          '../app/platachat-reglas.js', '../app/pagos-proveedor.js', 'sesion.js'];


/* ==========================================================================
 * 1. EL SOCIO NO VE PORCENTAJES
 * La técnica es la de motor.test.js («el socio no ve porcentajes», 8-sep):
 * se blanquean <style>, comentarios y atributos style, se perdonan los anchos
 * de barra, y cualquier «dígito + %» que quede es un precio dicho en tanto
 * por ciento. En PlataChat la regla es más dura todavía: hasta los
 * degradados del SVG van en fracciones para no tener que pedir perdón.
 * ======================================================================== */
describe('PlataChat: el socio no ve porcentajes', () => {

  function visibles(f) {
    let s = leer(f).replace(/\r\n/g, '\n');
    s = blanquear(s, /<style[\s\S]*?<\/style>/g);
    s = blanquear(s, /\/\*[\s\S]*?\*\//g);
    s = blanquear(s, /<!--[\s\S]*?-->/g);
    s = blanquear(s, /^\s*\/\/.*$/mg);
    s = blanquear(s, /style="[^"]*"/g);
    const CSS = /width:|height:/;
    return s.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /\d\s?%|pct\(/.test(l) && !CSS.test(l));
  }

  ['platachat/index.html', 'platachat/borrar-cuenta.html', 'descargas/platachat.html'].forEach(f => {
    test(f + ': ni un porcentaje de precio', () => {
      const v = visibles(f);
      assert.equal(v.length, 0, f + ' le muestra porcentajes al cliente: ' +
        v.map(([n, l]) => n + ': ' + l.trim().slice(0, 90)).join(' | '));
    });
  });

  test('la tasa se dice en pesos, con el primer crédito de 100.000 a 35.000 al lado', () => {
    /* La frase del contrato: «Con tu garantía de hoy este crédito te cuesta
       $C. Sin garantía, un primer crédito de $100.000 cuesta $35.000». Los dos
       números salen del motor (contrapropuestaNuevo), no escritos a mano. */
    assert.match(PAGINA, /Con tu garantía de hoy este crédito te cuesta/);
    assert.match(PAGINA, /Sin garantía, un primer crédito de/);
    assert.match(PAGINA, /M\.contrapropuestaNuevo\(/, 'el costo del primer crédito no sale del motor');
    /* Y la fracción de la garantía, con palabras. */
    /* 26-sep-2026: el 80/20 de Joan. Cuatro de cada cinco pesos, en palabras. */
    assert.match(PAGINA, /Cuatro de cada cinco pesos que pagas de costo/);
    assert.ok(!/Tres cuartas partes de lo que pagas/.test(PAGINA), 'quedó la frase del reparto viejo');
    assert.match(PAGINA, /Si te atrasas, la mora que pagas no suma/);
  });

  test('lo que todavía no existe se dice con palabras, no se finge', () => {
    const p = sinComentarios(PAGINA);
    assert.match(p, /class="mic" disabled title="Notas de voz: en camino"/,
      'el micrófono tiene que estar deshabilitado y decir que las notas de voz vienen');
    assert.ok(p.indexOf('TumiPay') < 0, 'la página le menciona TumiPay al cliente y hoy el proveedor es manual');
    /* 15-sep-2026, fase 1b: el reloj de una hora YA existe (base/20261005) y
       la página tiene la frase que lo promete, pero en UNA sola línea
       (FRASE_RELOJ) y detrás del interruptor RELOJ_OK: se enseña solo cuando
       la base contestó a una función del reloj; con la migración sin correr
       (404) vuelve a la frase de hoy. Hasta el 14-sep la regla era «ninguna
       hora en pantalla»; ahora es «ninguna hora que la base no cumpla». */
    const conHora = p.split('\n').filter(l => /(una|1) hora|en \d+ minutos|en menos de/.test(l));
    assert.ok(conHora.every(l => /FRASE_RELOJ/.test(l)),
      'la página promete un tiempo de respuesta fuera de FRASE_RELOJ: ' + conHora.map(l => l.trim().slice(0, 80)).join(' | '));
    assert.equal(conHora.length, 1, 'la frase de la hora tiene que vivir en una sola línea');
    assert.match(p, /RELOJ_OK \? FRASE_RELOJ : FRASE_HOY/, 'la frase de la hora no está detrás del interruptor RELOJ_OK');
  });
});


/* ==========================================================================
 * 2. EL CHAT ES EL ARCHIVO COMPARTIDO
 * Mismo cable que vigila chat.test.js en socio.html, el CRM y el espejo: el
 * hilo lo arma app/chat.js y SOLO app/chat.js. Una página que se copie la
 * burbuja es «una segunda copia que va a derivar» — lo dejó escrito de sí
 * mismo espejo.html cuando tuvo que copiarse aplicarVars.
 * ======================================================================== */
describe('PlataChat: el chat, cableado de verdad', () => {

  test('carga app/chat.js y app/chat.css, los mismos de la app del socio y el CRM', () => {
    assert.ok(PAGINA.indexOf('<script src="../app/chat.js"></script>') >= 0, 'no carga ../app/chat.js');
    assert.ok(PAGINA.indexOf('href="../app/chat.css"') >= 0, 'no carga ../app/chat.css');
  });

  test('y NO arma la burbuja por su cuenta', () => {
    assert.ok(PAGINA.indexOf('ch-burbuja') < 0,
      'platachat/index.html arma la burbuja del chat por su cuenta: eso es una segunda copia');
    assert.match(PAGINA, /CHAT\.hiloHTML\(/, 'el hilo no lo pinta ChatTuGarantia.hiloHTML');
  });

  test('chat.css pinta en verde porque la piel le da --rojo y --rojo-tinte con el nombre que pide', () => {
    /* chat.css no se toca (es de tres pantallas más). Lo que pide por nombre
       es --rojo; la piel se lo da apuntando al verde de la marca. Si alguien
       «arregla» chat.css para leer --marca, o borra el alias, el chat sale sin
       color. */
    const chatcss = leer('app/chat.css');
    const pide = new Set([...chatcss.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
    const define = new Set([...ESTILO.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    /* --x es una variable local que chat.css pone en línea; no viene de la piel. */
    const faltan = [...pide].filter(v => v !== '--x' && !define.has(v));
    assert.deepEqual(faltan, [], 'chat.css pide tokens que la piel no define: ' + faltan.join(', '));
  });

  test('las etiquetas de autor son las del contrato y el sondeo es cada 20 s con la pestaña a la vista', () => {
    /* 'equipo' es el gerente (base/20260923, sección 1). 'agente' NO puede
       decir «tu gerente»: para chat.js es el asistente, una máquina, y
       saldría punteado con nombre de persona. */
    assert.match(PAGINA, /panel:\s*'PlataChat',\s*equipo:\s*'tu gerente',\s*auto:\s*'automático'/);
    assert.ok(!/agente:\s*'tu gerente'/.test(PAGINA), 'la página rotula al asistente automático como «tu gerente»');
    assert.match(PAGINA, /CHAT_CADA_MS\s*=\s*20000/);
    assert.match(PAGINA, /document\.hidden/, 'el sondeo no mira si la app está a la vista');
    /* 26-sep-2026 — LA FOTO VA POR EL MISMO CAMINO QUE EN play/: chat_foto_sesion
       (base/20260922f, ya aplicada), comprimida como el resto de la casa, con
       miniatura, y la grande se abre comprobada. Dos caminos para una foto
       serían dos bandejas donde buscar un comprobante. */
    const codigo = sinComentarios(PAGINA);
    assert.ok(!/comprobante_subir/.test(codigo), 'volvió el camino propio de los comprobantes');
    assert.match(codigo, /'chat_foto_sesion',\s*\{\s*p_canal: CH\.canal, p_imagen: grande, p_miniatura: mini \|\| null, p_texto: pie \|\| null/);
    assert.match(codigo, /fotoDeLienzo\(c, 900, 0\.6\)/, 'la grande no es la de la casa (900 px, 0,6)');
    assert.match(codigo, /fotoDeLienzo\(c, 240, 0\.5\)/, 'no hace la miniatura');
    assert.match(codigo, /alVerFoto: 'verFotoChat'/, 'el hilo no deja abrir la foto');
    assert.match(codigo, /'chat_foto_sesion_ver', \{ p_id: Number\(id\) \}/);
    /* La lección del 22-sep: la foto de la base se comprueba ENTERA y se asigna
       como propiedad, nunca como texto dentro de un atributo. */
    assert.match(codigo, /CHAT\.esFoto\(imagen\)/);
    assert.match(codigo, /img\.src = imagen;/);
    assert.ok(!/document\.write/.test(codigo) && !/window\.open\(\)/.test(codigo), 'la foto se abre en otra pestaña o con document.write');
    assert.match(PAGINA, /accept="image\/\*" capture="environment"/);
  });
});


/* ==========================================================================
 * 3. LOS OCHO ARCHIVOS, EN ORDEN
 * ======================================================================== */
describe('PlataChat: lo que carga y en qué orden', () => {

  test('los <script src> son exactamente los ocho del contrato, en ese orden', () => {
    const srcs = [...PAGINA.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
    assert.deepEqual(srcs, SCRIPTS_EN_ORDEN);
  });

  test('cada uno existe donde la página lo busca', () => {
    SCRIPTS_EN_ORDEN.forEach(s => assert.ok(existe(path.join('platachat', s)), 'no existe ' + s));
    assert.ok(existe('platachat/estilo.css'));
    assert.ok(existe('app/chat.css'));
    assert.ok(existe('sw.js'), 'la página registra ../sw.js y no existe');
  });

  test('la piel va antes que chat.css, y el manifiesto y el color de la barra están', () => {
    const iPiel = PAGINA.indexOf('href="estilo.css"'), iChat = PAGINA.indexOf('href="../app/chat.css"');
    assert.ok(iPiel > 0 && iChat > iPiel, 'estilo.css tiene que cargarse antes que chat.css');
    assert.match(PAGINA, /<link rel="manifest" href="app.webmanifest">/);
    assert.match(PAGINA, /<meta name="theme-color" content="#0C0A0B">/);
    assert.match(PAGINA, /navigator\.serviceWorker\.register\('\.\.\/sw\.js'\)/);
    assert.match(PAGINA, /var VERSION_APP = '2026-09-26'/);
  });

  test('la guarda de HTTPS es lo PRIMERO que corre, antes que cualquier lectura del almacén', () => {
    /* Copia de socio.html: http:// y https:// son dos cajones distintos de
       localStorage. Si la guarda corriera después, la sesión se buscaría en el
       cajón equivocado y eso se ve igual que «se perdió mi cuenta». */
    const primero = /<script>([\s\S]*?)<\/script>/.exec(PAGINA)[1];
    assert.match(primero, /location\.replace\('https:'/);
    assert.ok(primero.indexOf('localStorage') < 0);
    assert.ok(PAGINA.indexOf('<script>') < PAGINA.indexOf('<link'), 'la guarda va después de un <link>');
  });
});


/* ==========================================================================
 * 4. TODO EL JAVASCRIPT COMPILA
 * ======================================================================== */
describe('PlataChat: todo el JavaScript compila', () => {

  test('cada <script> inline de index.html compila', () => {
    const inline = [...PAGINA.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    assert.ok(inline.length >= 3, 'esperaba la guarda, la versión y el script grande');
    inline.forEach((m, i) => assert.doesNotThrow(() => new vm.Script(m[1], { filename: 'platachat#' + i })));
  });

  test('borrar-cuenta.html también, y sesion.js se carga en Node', () => {
    const bc = leer('platachat/borrar-cuenta.html');
    [...bc.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .forEach((m, i) => assert.doesNotThrow(() => new vm.Script(m[1], { filename: 'borrar#' + i })));
    const SP = require('../platachat/sesion.js');
    ['entrar', 'registrar', 'recado', 'refrescar', 'rpc', 'guardar', 'leer', 'borrar', 'correoDe']
      .forEach(f => assert.equal(typeof SP[f], 'function', 'sesion.js no expone ' + f));
    assert.equal(SP.LLAVE, 'platachat_sesion');
  });
});


/* ==========================================================================
 * 5. LA PÁGINA PINTANDO DE VERDAD
 * El mismo arnés que vitrina.test.js le puso a play/ (9-sep) y panel.test.js
 * al CRM: un document de mentira que se acuerda de su innerHTML, un
 * localStorage de mentira y un fetch que rechaza salvo que la prueba le dé
 * una nube. Compilar no es ejecutar.
 *
 * Una diferencia a propósito: los <script src> se corren DENTRO del contexto
 * (leídos de la propia etiqueta), no con require(). Por sesion.js: busca
 * `fetch` y `localStorage` al momento de usarlos, y con require() serían los
 * de Node —el fetch REAL— en vez de los de mentira. Corriéndolo adentro, la
 * página habla con la nube de la prueba, como en un navegador.
 * ======================================================================== */
describe('PlataChat: la página pintando de verdad', () => {

  function abrirPlataChat(opciones) {
    const o = opciones || {};
    const almacen = {}, elems = {};
    /* Los temporizadores se ANOTAN, no corren: así una prueba puede contar
       cuántos latidos quedaron vivos y disparar uno a mano. */
    const temporizadores = []; let idT = 0;
    const elem = id => (elems[id] = elems[id] || {
      id, value: '', checked: false, max: '', min: '', step: '', textContent: '', innerHTML: '',
      dataset: {}, style: {}, files: null, disabled: false, scrollTop: 0, scrollHeight: 0,
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {}, removeEventListener() {},
      querySelector: () => null, querySelectorAll: () => [],
      appendChild() {}, insertBefore() {}, removeChild() {}, remove() {},
      setAttribute() {}, getAttribute: () => null, focus() {}, click() {},
      getContext: () => null, scrollIntoView() {}
    });
    const doc = {
      getElementById: elem, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => elem('creado-' + Math.random()), addEventListener() {},
      head: elem('head'), body: elem('body'), documentElement: elem('html'), title: '', hidden: false
    };
    const ctx = {
      console, document: doc, alert() {}, confirm: () => true,
      localStorage: { getItem: k => (k in almacen ? almacen[k] : null),
                      setItem: (k, v) => { almacen[k] = String(v); },
                      removeItem: k => { delete almacen[k]; } },
      location: { href: 'https://tugarantia.net/platachat/', hash: '', hostname: 'tugarantia.net',
                  pathname: '/platachat/', search: '', protocol: 'https:',
                  host: 'tugarantia.net', origin: 'https://tugarantia.net', reload() {}, replace() {} },
      history: { replaceState() {} },
      navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve() } },
      fetch: (url, cfg) => (o.red ? o.red(String(url), cfg)
        : Promise.reject(new Error('sin red en el banco de pruebas'))),
      setTimeout: (fn, ms) => { const t = { id: ++idT, fn, ms: Number(ms) || 0, vivo: true }; temporizadores.push(t); return t.id; },
      clearTimeout: id => { temporizadores.forEach(t => { if (t.id === id) t.vivo = false; }); },
      setInterval: () => 0, clearInterval() {},
      requestAnimationFrame: () => 0, cancelAnimationFrame() {},
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      Date, Math, JSON, URL, Intl, TextEncoder, TextDecoder, Promise, Error,
      btoa: s => Buffer.from(s, 'binary').toString('base64'),
      atob: s => Buffer.from(s, 'base64').toString('binary'),
      Image: class {}, FileReader: class {}, Blob: class {}, File: class {},
      open() {}, scrollTo() {}, performance: { now: () => 0 },
      _oyentes: {},
      addEventListener(t, f) { (this._oyentes[t] = this._oyentes[t] || []).push(f); },
      removeEventListener() {}, dispatchEvent() { return true; }
    };
    ctx.window = ctx; ctx.self = ctx;
    Object.assign(almacen, o.almacen || {});
    vm.createContext(ctx);
    const srcs = [...PAGINA.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
    srcs.forEach(s => vm.runInContext(leer(path.join('platachat', s)), ctx, { filename: s }));
    [...PAGINA.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .forEach((m, i) => vm.runInContext(m[1], ctx, { filename: 'platachat#' + i }));
    return { ev: e => vm.runInContext(e, ctx, { filename: 'banco' }), elems, almacen, ctx, srcs,
             pendientes: ms => temporizadores.filter(t => t.vivo && (ms == null || t.ms === ms)),
             disparar: t => { t.vivo = false; t.fn(); } };
  }

  /* Una nube de mentira que anota cada llamada y contesta por nombre de
     función. Contesta con .text() porque sesion.js lee el cuerpo como texto
     y lo intenta como JSON (un proxy caído contesta HTML). */
  function nube(respuestas) {
    const llamadas = [], colgadas = [];
    const red = (url, cfg) => {
      const fn = (/rpc\/([a-z_0-9]+)/.exec(url) || [, url])[1];
      let cuerpo = null;
      try { cuerpo = JSON.parse(cfg && cfg.body); } catch (e) {}
      llamadas.push({ url, fn, cuerpo, cab: (cfg && cfg.headers) || {} });
      const r = typeof respuestas === 'function' ? respuestas(fn, cuerpo, llamadas) : (respuestas[fn] || { ok: true });
      const estado = r.__estado || 200;
      const resp = { ok: estado < 400, status: estado, text: () => Promise.resolve(JSON.stringify(r)) };
      /* __colgar: la respuesta se queda en el aire hasta que la prueba la
         suelte (colgadas[i]()), para poder cruzar dos traídas en vuelo. */
      if (r.__colgar) return new Promise(res => colgadas.push(() => res(resp)));
      return Promise.resolve(resp);
    };
    return { red, llamadas, colgadas };
  }

  /* Un DOM de mentira armado del HTML que devuelve chat.js: un nodo por
     .ch-msg con sus clases de verdad, y una burbuja que anota qué le hicieron
     (qué etiqueta le pusieron encima, si le quitaron la marca de chat.js). */
  function domDe(html) {
    const nodos = html.split('<div class="ch-msg ').slice(1).map(s => {
      const clases = new Set(('ch-msg ' + s.slice(0, s.indexOf('"'))).split(/\s+/));
      const tieneAuto = /class="ch-auto"/.test(s);
      const burbuja = {
        etiqueta: null, quitoAuto: false, firstChild: {},
        querySelector: sel => (sel === '.ch-auto' && tieneAuto ? { auto: true } : null),
        removeChild(x) { if (x && x.auto) this.quitoAuto = true; },
        insertBefore(q) { this.etiqueta = q.textContent; }
      };
      return { clases, burbuja, firstElementChild: burbuja,
               classList: { contains: c => clases.has(c), remove: c => clases.delete(c), add: c => clases.add(c) } };
    });
    return { nodos, querySelectorAll: sel => (sel === '.ch-msg' ? nodos : []) };
  }

  /* La cuenta de prueba del enunciado del 5-ago: tres créditos de 100.000
     pagados en fecha (45.000 ganados) y la ficha completa (100.000 de cupón)
     dan 145.000 de cupo. Es la misma cuenta que motor.test.js sigue midiendo
     desde el motor; acá se mide desde la pantalla. */
  const CUENTA_PRUEBA = {
    ok: true, vinculada: true, nombre: 'Ana', actualizado_en: '2026-09-14',
    datos: { garantia: { total: 145000, acumulada: 45000, comprometida: 0, cupon: 100000, referidos: 0 },
             creditos: [], respaldados: [], perfil: { datos: {} },
             referidos: { total: 0, pagaron: 0, lista: [] }, resumen: {} }
  };
  const SESION_FALSA = 'SES = { access_token: "token-de-prueba", refresh_token: "refresco", celular: "3001112233", nombre: "Ana" }';
  const tick = () => new Promise(r => setImmediate(r));

  test('el banco carga los ocho archivos y los ocho dejan su global', () => {
    const P = abrirPlataChat();
    assert.deepEqual(P.srcs, SCRIPTS_EN_ORDEN);
    ['MotorReglas', 'FichaSocio', 'PuenteTuGarantia', 'CuentaSocio', 'ChatTuGarantia', 'PlataChatReglas', 'PagosProveedor', 'SesionPlataChat']
      .forEach(g => assert.equal(typeof P.ctx[g], 'object', g + ' no quedó en window'));
  });

  test('LA PUERTA PINTA sin red y sin sesión: si algo revienta, el cliente ve blanco', () => {
    const P = abrirPlataChat();
    assert.doesNotThrow(() => P.ev('pintarEntrar()'));
    const h = P.elems.entrarCuerpo.innerHTML;
    assert.ok(h.length > 1500, 'la puerta salió casi vacía (' + h.length + ' letras)');
    ['inCelular', 'inClave', 'btnEntrar', 'inNuevoCelular', 'inNuevoNombre', 'inNuevoCedula', 'inNuevoClave', 'btnRegistrar']
      .forEach(id => assert.ok(h.indexOf('id="' + id + '"') >= 0, 'la puerta no tiene #' + id));
    assert.match(h, /¿Ya eras cliente de Tu Garantía\? Después de entrar escribe tu código en <b>Yo<\/b>/);
    assert.equal(P.ev('S'), null, 'sin sesión no hay socio abierto');
    assert.equal(P.ev('SES'), null);
  });

  test('CON LA CUENTA DE PRUEBA, Plata pinta 145.000 de cupo, 45.000 ganados y 4 monedas y media', async () => {
    const n = nube({ mi_cuenta: CUENTA_PRUEBA });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');

    /* Habla con la base con la SESIÓN, no con el anon como Bearer (eso es lo
       que chat.js hace y por eso no sirve acá). */
    assert.equal(n.llamadas[0].fn, 'mi_cuenta');
    assert.equal(n.llamadas[0].cab.Authorization, 'Bearer token-de-prueba');
    assert.equal(n.llamadas[0].cab.apikey, P.ev('CFG.anon'));
    assert.ok(n.llamadas.some(l => l.fn === 'marcar_acceso' && l.cuerpo.p_app === 'platachat'),
      'no cuenta el acceso a la app (marcar_acceso con p_app platachat)');

    assert.equal(P.ev('S.cupo'), 145000);
    assert.equal(P.ev('S.gd.ganada'), 45000);
    assert.equal(P.ev('S.gd.cupon'), 100000);
    assert.equal(P.ev('S.cupo'), M.calcularCupo(145000, M.nivelPorGarantia(145000)),
      'el cupo de la pantalla no es el del motor');
    assert.equal(P.ev('TAB'), 'plata', 'abre en Plata');
    assert.equal(P.elems.uResumen.textContent, '$45.000 ganados · cupo $145.000');

    const h = P.elems.cuerpo.innerHTML;
    assert.ok(h.indexOf('$145.000') >= 0, 'no pinta el cupo de 145.000');
    assert.ok(h.indexOf('$45.000') >= 0, 'no pinta los 45.000 ganados');
    assert.match(h, /Por tus datos<\/span><span class="v">\+\$100\.000/);
    assert.match(h, /4 monedas y media/, 'no cuenta las monedas con palabras');
    assert.equal((h.match(/class="moneda brillo"/g) || []).length, 4, 'no son cuatro monedas enteras');
    assert.equal((h.match(/class="moneda media"/g) || []).length, 1, 'falta la media moneda');
    assert.ok((h.match(/class="lingote"/g) || []).length === 0, 'pintó un lingote sin llegar a 100.000');
    assert.match(h, /Tu garantía es tu cupo, no un ahorro: no se retira ni se devuelve; crece cuando pagas en fecha\./,
      'falta la frase que dice qué es la garantía (Ley 1480)');
    assert.ok(!/historial está en camino/.test(h), 'a un vinculado le dice que su historial está en camino');
    assert.ok(!/(una|1) hora|en \d+ minutos/.test(h), 'promete un tiempo de respuesta');
    /* La sesión guardada lleva lo último bajado y NUNCA una contraseña. */
    const g = JSON.parse(P.almacen.platachat_sesion);
    assert.equal(g.access_token, 'token-de-prueba');
    assert.equal(g.ultimo.vinculada, true);
    assert.ok(!('password' in g) && !('clave' in g));
  });

  test('y la calculadora en 100.000 dice 120.000 a pagar y +16.000 de garantía, sacados del motor (80/20)', async () => {
    const n = nube({ mi_cuenta: CUENTA_PRUEBA });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    /* Abre en el cupo (145.000); se mueve a 100.000 como haría el dedo. */
    assert.equal(P.ev('MONTO'), 145000);
    P.ev('setMonto(100000)');
    assert.equal(P.ev('MONTO'), 100000);
    assert.equal(P.elems.calcMonto.textContent, '$100.000');
    assert.match(P.elems.calcAviso.innerHTML, /Dentro de tu cupo de \$145\.000/);

    const s = P.elems.calcSalida.innerHTML;
    assert.match(s, /Lo que pagarías<b>\$120\.000<\/b>/, 'no dice 120.000 a pagar');
    assert.match(s, /ganas<b>\+\$16\.000<\/b>/, 'no dice +16.000 de garantía');
    assert.match(s, /\$61\.000 ganados, cupo \$161\.000/, 'no dice cómo quedaría después');
    assert.match(s, /te cuesta <b>\$20\.000<\/b>\. Sin garantía, un primer crédito de \$100\.000 cuesta <b>\$35\.000<\/b>/);
    /* El botón lleva la fecha, los días y los cortes (uno): lo que el chat
       va a decir es lo que la pantalla mostró. */
    assert.match(s, /onclick="pedirPorChat\(100000,'\d{4}-\d{2}-\d{2}',\d+,1\)">Pedir \$100\.000 por el chat</);

    /* Los tres números son los del motor con esta misma cuenta: si un día la
       pantalla y el motor se separan, esta línea lo dice. */
    const sim = M.simularCredito(100000, 145000, { nivelSocio: M.nivelPorGarantia(145000), fechaDesembolso: P.ev('hoyISO()') });
    assert.equal(sim.total_a_pagar, 120000);
    assert.equal(sim.garantia_que_deja, 16000, 'el motor ya no deja el 80% (23-sep)');
    assert.ok(s.indexOf(P.ev('fmtFecha("' + sim.fecha_corte + '")')) >= 0, 'la fecha de corte no es la del motor');
    /* El préstamo de 1 a 6 meses queda apagado: 45.000 ganados no llegan al millón. */
    assert.match(P.elems.cuerpo.innerHTML, /data-modo="respaldado" onclick="setModo\('respaldado'\)" disabled/);
  });

  /* ------------------------------------------------------------------
     La calculadora del 15-sep: la barra hasta dos millones y «para cuándo
     lo pagas» (pedido de Joan del 14 por la tarde). Cuatro cables: la
     barra y los atajos; los cortes elegibles y su precio; el calendario
     que salta al corte; y que por encima del cupo o del tope del nuevo
     NO se cotiza como si fuera posible.
     ---------------------------------------------------------------- */

  test('LA BARRA VA DE 50.000 A 2.000.000 con los seis atajos y «tu cupo»; por encima del cupo no cotiza, dice cuánto falta', async () => {
    const n = nube({ mi_cuenta: CUENTA_PRUEBA });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    assert.equal(P.ev('TOPE_CALCULADORA_PLATACHAT'), 2000000);
    assert.equal(P.elems.calcRange.min, 50000, 'la barra no arranca en 50.000');
    assert.equal(P.elems.calcRange.max, 2000000, 'la barra no llega a 2.000.000');
    const chips = [...P.elems.calcChips.innerHTML.matchAll(/setMonto\((\d+)\)">([^<]+)</g)].map(m => [Number(m[1]), m[2]]);
    assert.deepEqual(chips, [[50000, '$50k'], [100000, '$100k'], [145000, 'tu cupo'], [300000, '$300k'],
                             [500000, '$500k'], [1000000, '$1M'], [2000000, '$2M']],
      'los atajos no son 50k · 100k · tu cupo · 300k · 500k · 1M · 2M');
    /* Y el motor sigue con su techo de cinco millones: el de PlataChat es otro. */
    assert.equal(M.MONTO_MAXIMO_CALCULADORA, 5000000);

    P.ev('setMonto(2000000)');
    assert.equal(P.ev('MONTO'), 2000000);
    assert.match(P.elems.calcAviso.innerHTML, /Es más que tu cupo de \$145\.000/);
    const s = P.elems.calcSalida.innerHTML;
    const sim = M.simularCredito(2000000, 145000, { nivelSocio: M.nivelPorGarantia(145000), fechaDesembolso: P.ev('hoyISO()') });
    assert.equal(sim.falta_garantia, 1855000);
    assert.match(s, /Te falta \$1\.855\.000 de garantía para pedir \$2\.000\.000\./, 'no dice en pesos cuánta garantía falta');
    assert.match(s, /Puedes pedirlo igual por el chat y lo revisamos, o pide hasta \$145\.000 que ya tienes/);
    /* Por encima del cupo no hay «para cuándo»: eso lo decide Joan al revisar. */
    assert.equal(P.elems.calcPlazo.innerHTML, '', 'ofrece elegir cortes por encima del cupo');
    assert.match(s, /pedirPorChat\(2000000,'\d{4}-\d{2}-\d{2}',null,1\)">Pedir \$2\.000\.000 por el chat</);
  });

  test('PARA CUÁNDO: tres cortes a elegir; dos cortes son 140.000 y +32.000; el calendario salta al corte que cubre el día', async () => {
    const R = require('../app/platachat-reglas.js');
    const n = nube({ mi_cuenta: CUENTA_PRUEBA });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    P.ev('setMonto(100000)');
    const hoy = P.ev('hoyISO()');
    const dia = iso => P.ev('fmtDia("' + iso + '")');
    const fecha = iso => P.ev('fmtFecha("' + iso + '")');
    const dias = iso => M.diasEntre(M.aFechaLocal(hoy), M.aFechaLocal(iso));
    /* Los cortes son los del motor: el primero para un desembolso de hoy y
       cada uno más una prórroga, con el tope de prórrogas del nivel (dos). */
    const fechas = R.cortesDesde(hoy, 3, M);
    assert.equal(fechas[0], M.calcularFechaCorte(hoy));
    assert.equal(fechas[1], M.fechaCorteProrroga(fechas[0]));
    assert.equal(1 + M.prorrogasPermitidas(M.nivelPorGarantia(145000)), 3);
    assert.equal(P.ev('CORTES'), 1);
    let plazo = P.elems.calcPlazo.innerHTML;
    assert.match(plazo, /¿Para cuándo lo pagas\?/);
    assert.ok(plazo.indexOf('class="chip on" onclick="setCortes(1)">este corte · ' + dia(fechas[0]) + '<') >= 0, 'falta «este corte» marcado');
    assert.ok(plazo.indexOf('class="chip" onclick="setCortes(2)">el siguiente · ' + dia(fechas[1]) + '<') >= 0, 'falta «el siguiente»');
    assert.ok(plazo.indexOf('class="chip" onclick="setCortes(3)">en dos cortes · ' + dia(fechas[2]) + '<') >= 0, 'falta «en dos cortes»');
    assert.ok(plazo.indexOf('setCortes(4)') < 0, 'ofrece más cortes que 1 + las prórrogas permitidas');
    const manana = M.iso(M.sumarDias(M.aFechaLocal(hoy), 1));
    assert.ok(plazo.indexOf('<input type="date" id="calcFecha" min="' + manana + '" max="' + fechas[2] + '" value="' + fechas[0] + '"') >= 0,
      'el calendario no va de mañana al último corte permitido');
    assert.match(plazo, /Cada corte de más cuesta lo mismo que el crédito/);
    let s = P.elems.calcSalida.innerHTML;
    assert.ok(s.indexOf('Lo que pagarías<b>$120.000</b>el ' + fecha(fechas[0]) + ', en ' + dias(fechas[0]) + ' días, en un solo pago<') >= 0,
      'con un corte no dice la fecha, los días y «en un solo pago»');
    assert.ok(s.indexOf('Pagas el ' + fecha(fechas[0]) + ', en ' + dias(fechas[0]) + ' días: $100.000 más $20.000 de costo, una quincena.') >= 0);

    /* Dos cortes: el costo y la garantía por dos; el total, el capital más eso. */
    P.ev('setCortes(2)');
    assert.equal(P.ev('CORTES'), 2);
    s = P.elems.calcSalida.innerHTML;
    assert.ok(s.indexOf('Lo que pagarías<b>$140.000</b>el ' + fecha(fechas[1]) + ', en ' + dias(fechas[1]) + ' días, por cortes<') >= 0,
      'dos cortes no son 140.000 hasta el segundo corte');
    assert.match(s, /ganas<b>\+\$32\.000<\/b>/, 'dos cortes no dejan +32.000');
    assert.match(s, /\$77\.000 ganados, cupo \$177\.000/);
    assert.ok(s.indexOf('Hasta el ' + fecha(fechas[1]) + ', en ' + dias(fechas[1]) + ' días: <b>$40.000</b> de costo, son dos quincenas de $20.000') >= 0,
      'no explica las dos quincenas en pesos');
    assert.ok(s.indexOf('Se paga por cortes: $20.000 el ' + fecha(fechas[0]) + ' y $120.000 el ' + fecha(fechas[1])) >= 0,
      'no dice qué se paga en cada corte');
    assert.ok(s.indexOf('onclick="pedirPorChat(100000,\'' + fechas[1] + '\',' + dias(fechas[1]) + ',2)">Pedir $100.000 por el chat<') >= 0,
      'el botón no lleva la fecha elegida, los días y los cortes');
    assert.match(P.elems.calcPlazo.innerHTML, /class="chip on" onclick="setCortes\(2\)"/);
    /* La cuenta de la prórroga es la del motor: mismo precio que el crédito. */
    assert.equal(M.tasaDeProrroga ? M.tasaDeProrroga({ tasa_aplicada: 0.2 }, {}) : 0.2, 0.2);

    /* Tres cortes: 160.000 y +48.000. Más que el tope no existe. */
    P.ev('setCortes(9)');
    assert.equal(P.ev('CORTES'), 3, 'dejó elegir más cortes que el tope');
    s = P.elems.calcSalida.innerHTML;
    assert.match(s, /Lo que pagarías<b>\$160\.000<\/b>/);
    assert.match(s, /ganas<b>\+\$48\.000<\/b>/);
    assert.match(s, /son tres quincenas de \$20\.000/);

    /* El calendario: un día entre el primer y el segundo corte salta al
       segundo; un día antes del primero, al primero; basura no mueve nada. */
    P.ev('setFechaPago("' + M.iso(M.sumarDias(M.aFechaLocal(fechas[0]), 1)) + '")');
    assert.equal(P.ev('CORTES'), 2, 'un día después del primer corte no saltó al segundo');
    assert.ok(P.elems.calcPlazo.innerHTML.indexOf('value="' + fechas[1] + '"') >= 0, 'el calendario no muestra el corte al que saltó');
    P.ev('setFechaPago("' + manana + '")');
    assert.equal(P.ev('CORTES'), 1);
    P.ev('setFechaPago("2099-12-31")');
    assert.equal(P.ev('CORTES'), 3, 'una fecha lejana no se recortó al último corte permitido');
    P.ev('setFechaPago("")'); P.ev('setFechaPago("hoy")');
    assert.equal(P.ev('CORTES'), 3);
    /* Al volver a abrir la cuenta, el «para cuándo» vuelve al primer corte. */
    P.ev('pintarCuenta()');
    assert.equal(P.ev('CORTES'), 1);
  });

  test('sin platachat-reglas.js la calculadora cotiza al primer corte y NO ofrece elegir', async () => {
    const n = nube({ mi_cuenta: CUENTA_PRUEBA });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    P.ev('R = null; setMonto(100000)');
    assert.equal(P.elems.calcPlazo.innerHTML, '');
    assert.match(P.elems.calcSalida.innerHTML, /Lo que pagarías<b>\$120\.000<\/b>el [^<]*, en un solo pago</);
    assert.match(P.elems.calcSalida.innerHTML, /pedirPorChat\(100000,'\d{4}-\d{2}-\d{2}',null,1\)/);
  });

  test('abrir() lee el paquete con app/ficha.js: el MISMO cupo, nivel y máximo que socio.html y play/', async () => {
    /* Hasta el 15-sep la página traía su copia de la aritmética de la ficha
       (nivel por el total, prestada por resta, comprometida recortada,
       maximoRespaldado). Ahora la lee FichaSocio.leer, el archivo que las
       otras dos pantallas ya usan: un solo dueño de esa cuenta. */
    const FICHA = require('../app/ficha.js');
    const f = FICHA.leer(CUENTA_PRUEBA.datos);
    const n = nube({ mi_cuenta: CUENTA_PRUEBA });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    assert.equal(P.ev('S.cupo'), f.cupo);
    assert.equal(P.ev('S.nivel'), f.nivel);
    assert.equal(P.ev('S.maxRespaldado'), f.maxRespaldado);
    assert.equal(P.ev('S.garantia'), f.gd.total);
    /* Por JSON: los objetos del banco nacen en otro contexto de vm y deepEqual
       estricto los distingue por el prototipo, no por lo que traen. */
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(S.gd)')), f.gd);
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(S.perfil)')), f.entrada.datos);
    const p = sinComentarios(PAGINA);
    assert.match(p, /F\.leer\(/, 'abrir() no llama a FichaSocio.leer');
    ['M.calcularCupo(', 'M.maximoRespaldado(', 'g.acumulada', 'M.nivelPorGarantia(Number('].forEach(x =>
      assert.ok(p.indexOf(x) < 0, 'index.html sigue haciendo por su cuenta la cuenta de la ficha: ' + x));
    assert.match(PAGINA, /<script src="\.\.\/app\/ficha\.js"><\/script>/);
    assert.ok(PAGINA.indexOf('<script src="../app/motor.js">') < PAGINA.indexOf('<script src="../app/ficha.js">'),
      'ficha.js tiene que ir después del motor: lo toma de window.MotorReglas al cargar');
  });

  test('si ficha.js no llegó, abre sin ficha y lo DICE arriba, en vez de calcular a mano', async () => {
    const n = nube({ mi_cuenta: CUENTA_PRUEBA });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    P.ev('F = null');
    await P.ev('cargarCuenta()');
    assert.equal(P.ev('S.vinculada'), false);
    assert.equal(P.ev('S.cupo'), 0);
    assert.match(P.elems.cuerpo.innerHTML, /No cargó la parte de la app que lee tu ficha \(app\/ficha\.js\)/);
    /* Con ficha.js de vuelta, el aviso se va solo. */
    P.ev('F = window.FichaSocio');
    await P.ev('cargarCuenta()');
    assert.equal(P.ev('AVISO_FICHA'), '');
    assert.equal(P.ev('S.cupo'), 145000);
  });

  test('SIN VINCULAR: cupo cero, «tu historial está en camino», y el primer crédito por el chat', async () => {
    const n = nube({ mi_cuenta: { ok: true, vinculada: false } });
    const P = abrirPlataChat({ red: n.red });
    P.ev('SES = { access_token: "token-de-prueba", celular: "3001112233", nombre: "Nuevo" }');
    await P.ev('cargarCuenta()');
    assert.equal(P.ev('S.vinculada'), false);
    assert.equal(P.ev('S.cupo'), 0);
    assert.equal(P.elems.uResumen.textContent, 'Tu cupo hoy: $0');
    const plata = P.elems.cuerpo.innerHTML;
    assert.match(plata, /Tu cupo<\/span><span class="v">\$0</, 'no pinta el cupo en cero');
    assert.match(plata, /Tu historial está en camino: si ya eras cliente, escribe tu código en <b>Yo<\/b>/);
    assert.match(plata, /tu primer crédito lo pides por el chat de <b>Créditos<\/b>/);
    assert.match(plata, /Todavía sin monedas/);
    assert.match(plata, /Tu garantía es tu cupo, no un ahorro/);
    /* El nuevo cotiza su primer crédito con la política de nuevos, en pesos,
       a los 8 días que fija la política: él no elige la fecha todavía. */
    assert.equal(P.ev('MONTO'), 100000);
    assert.match(P.elems.calcSalida.innerHTML, /Lo que pagarías<b>\$135\.000<\/b>el [^<]*, en 8 días, en un solo pago</);
    assert.match(P.elems.calcSalida.innerHTML, /Este primer crédito te cuesta <b>\$35\.000<\/b>/);
    assert.match(P.elems.calcSalida.innerHTML, /Tu primer crédito es a 8 días; desde el segundo eliges la fecha\./);
    assert.match(P.elems.calcSalida.innerHTML, /pedirPorChat\(100000,'\d{4}-\d{2}-\d{2}',8,1\)/);
    assert.equal(P.elems.calcPlazo.innerHTML, '', 'al nuevo le ofrece elegir cortes y su primer crédito es a 8 días');
    /* La barra también le llega a 2.000.000, con los mismos seis atajos y sin «tu cupo». */
    assert.equal(P.elems.calcRange.min, 50000);
    assert.equal(P.elems.calcRange.max, 2000000);
    assert.deepEqual([...P.elems.calcChips.innerHTML.matchAll(/setMonto\((\d+)\)/g)].map(m => Number(m[1])),
      [50000, 100000, 300000, 500000, 1000000, 2000000]);
    assert.ok(P.elems.calcChips.innerHTML.indexOf('tu cupo') < 0);
    /* Por encima de los 100.000 NO se cotiza: dice el tope y cuántos
       créditos pagados en fecha faltan, con la escalera de platachat-reglas. */
    const R = require('../app/platachat-reglas.js');
    const faltan = R.creditosHasta(300000, 0, 0, { tasa: 0.2, gasto: R.gastoManual, primero: { capital: 100000, tasa: 0.35 } });
    assert.equal(faltan, 17, 'con el 80/20 son 17 (eran 19 con el 75/25)');
    P.ev('setMonto(300000)');
    assert.equal(P.ev('MONTO'), 300000);
    const s = P.elems.calcSalida.innerHTML;
    assert.match(s, /<b>Sin garantía, el primer crédito llega hasta \$100\.000\.<\/b> Para pedir \$300\.000 te faltan 17 créditos pagados en fecha, pidiendo cada vez todo tu cupo\./);
    assert.ok(s.indexOf('$405.000') < 0, 'cotizó 300.000 al precio del primer crédito como si fuera posible');
    assert.ok(s.indexOf('Pedir $300.000 por el chat') < 0, 'ofrece pedir 300.000 sin garantía');
    assert.match(s, /Lo que sí puedes pedir hoy, \$100\.000:/);
    assert.match(s, /Lo que pagarías<b>\$135\.000<\/b>/);
    assert.match(s, /Pedir \$100\.000 por el chat</);
    P.ev('setMonto(2000000)');
    assert.match(P.elems.calcSalida.innerHTML, /Para pedir \$2\.000\.000 te faltan 30 créditos pagados en fecha/);
    P.ev('setMonto(100000)');

    P.ev('irA("yo")');
    const yo = P.elems.cuerpo.innerHTML;
    assert.match(yo, /¿Ya eras cliente de Tu Garantía\?/);
    assert.ok(yo.indexOf('id="inVincIdent"') >= 0 && yo.indexOf('id="inVincCodigo"') >= 0, 'Yo no ofrece juntar el historial');
    assert.match(yo, /Tu historial está en camino/);
    assert.match(yo, /href="borrar-cuenta\.html"/);
    assert.match(yo, /onclick="salir\(\);return false">Salir</);
  });

  test('SIN NUBE con sesión guardada: pinta lo último bajado y dice «Sin conexión»', async () => {
    const P = abrirPlataChat();   // fetch rechaza
    P.ev('SES = { access_token: "token-de-prueba", celular: "3001112233", nombre: "Ana", ultimo: ' +
         JSON.stringify(CUENTA_PRUEBA) + ', ultimoEl: "2026-09-13" }');
    await P.ev('cargarCuenta()');
    assert.equal(P.ev('SIN_NUBE'), true);
    assert.equal(P.ev('S.cupo'), 145000, 'sin red perdió los números que ya tenía');
    assert.match(P.elems.cuerpo.innerHTML, /<b>Sin conexión\.<\/b> Estos son tus números al 13 sep 2026/);
  });

  test('si la base contesta 404 (migración sin correr), abre como nuevo y lo DICE arriba', async () => {
    const n = nube(fn => (fn === 'mi_cuenta' ? { __estado: 404, message: 'no existe' } : { ok: true }));
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    assert.equal(P.ev('S.vinculada'), false);
    assert.match(P.elems.cuerpo.innerHTML, /falta correr base\/20260914b_tres_canales\.sql/);
  });

  test('ARRANQUE con sesión guardada y vencida en la nube: vuelve a la puerta con el motivo, y borra lo guardado', async () => {
    /* Acá no se llama a cargarCuenta(): la sesión va en el localStorage de
       mentira ANTES de correr la página, y es el arranque de la página el que
       la lee y pregunta. Es el camino que recorre un cliente que vuelve a
       abrir la app, y el que nadie ve desde el computador de Joan. */
    const n = nube(() => ({ __estado: 401 }));
    const P = abrirPlataChat({ red: n.red, almacen: { platachat_sesion: JSON.stringify(
      { access_token: 'viejo', refresh_token: 'r', celular: '3001112233' }) } });
    await tick(); await tick();
    assert.equal(n.llamadas[0].fn, 'mi_cuenta', 'el arranque no preguntó por la cuenta con la sesión guardada');
    assert.equal(n.llamadas[0].cab.Authorization, 'Bearer viejo');
    assert.equal(P.ev('SES'), null);
    assert.equal(P.ev('S'), null);
    assert.ok(!('platachat_sesion' in P.almacen), 'la sesión vencida sigue en el teléfono');
    assert.match(P.elems.errEntrar.textContent, /Tu sesión venció/);
    /* Intentó refrescar UNA vez y no más: un 401 tras el refresh es «afuera»,
       no un bucle. */
    assert.equal(n.llamadas.filter(l => /grant_type=refresh_token/.test(l.url)).length, 1);
    assert.equal(n.llamadas.length, 2, 'después del refresh fallido siguió pidiendo');
  });

  test('«Pedir por el chat» escribe el texto exacto en Créditos y lleva a Chats', async () => {
    /* 15-sep-2026, fase 1b: pedir va PRIMERO a solicitar_platachat (la
       solicitud con reloj). Esta prueba clava el camino de hoy —una base sin
       base/20261005, que contesta 404— y por eso la nube lo contesta así; el
       camino nuevo se prueba en platachat-solicitud-pagina.test.js. */
    const n = nube({ mi_cuenta: CUENTA_PRUEBA, chat_leer_sesion: { ok: true, canal: 'creditos', mensajes: [] },
                     solicitar_platachat: { __estado: 404 }, mi_solicitud_platachat: { __estado: 404 } });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    P.ev('pedirPorChat(100000, "2026-09-30", 15, 1)');
    await tick(); await tick();
    const escrito = n.llamadas.find(l => l.fn === 'chat_escribir_sesion');
    assert.ok(escrito, 'no mandó nada a chat_escribir_sesion');
    /* Con la fecha elegida y los días (15-sep): Joan lee lo mismo que el cliente vio. */
    assert.deepEqual(escrito.cuerpo, { p_canal: 'creditos', p_texto: 'Quiero pedir $100.000 para el 30 sep 2026 (en 15 días). ¿Me alcanza?' });
    assert.equal(escrito.cab.Authorization, 'Bearer token-de-prueba');
    assert.equal(P.ev('TAB'), 'chats');
    assert.equal(P.ev('CANAL'), 'creditos');
    const leido = n.llamadas.find(l => l.fn === 'chat_leer_sesion');
    assert.ok(leido && leido.cuerpo.p_canal === 'creditos' && leido.cuerpo.p_desde === 0, 'no volvió a traer el hilo de Créditos');
    assert.equal(P.ev('BORRADOR'), '');
  });

  test('si no se pudo mandar, el texto queda en la caja: no se pierde', async () => {
    /* Con el reloj apagado en la base (404, fase 1b) y el chat caído (500):
       el camino de hoy con la nube contestando mal. Un 500 en
       solicitar_platachat NO cae al mensaje —se queda en Plata con el
       error—, por eso acá el reloj contesta 404 y no 500. */
    const n = nube(fn => (fn === 'mi_cuenta' ? CUENTA_PRUEBA
      : /platachat$/.test(fn) ? { __estado: 404 } : { __estado: 500 }));
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    P.ev('pedirPorChat(100000, "2026-10-15", 30, 2)');
    await tick(); await tick();
    assert.equal(P.ev('TAB'), 'chats');
    /* Con dos cortes el mensaje lo dice; sin días (una fecha suelta) no inventa ninguno. */
    assert.equal(P.elems.chTexto.value, 'Quiero pedir $100.000 para el 15 oct 2026 (en 30 días, dos quincenas). ¿Me alcanza?');
    P.ev('pedirPorChat(100000, "2026-09-30")');
    await tick(); await tick();
    assert.equal(P.elems.chTexto.value, 'Quiero pedir $100.000 para el 30 sep 2026. ¿Me alcanza?');
  });

  test('el hilo es LETRA POR LETRA lo que arma chat.js, y la barra dice lo que no hace', async () => {
    const mensajes = [
      { id: 1, de: 'socio', texto: 'hola', creado_en: '2026-09-14T10:00:00-05:00', visto: true },
      { id: 2, de: 'panel', texto: 'buenas', creado_en: '2026-09-14T10:05:00-05:00' },
      { id: 3, de: 'auto', texto: 'tu pago', regla: 'cuando-pago', creado_en: '2026-09-14T10:06:00-05:00' },
      { id: 4, de: 'equipo', texto: '<b>x</b>', creado_en: '2026-09-14T10:07:00-05:00' }
    ];
    const n = nube({ mi_cuenta: CUENTA_PRUEBA, chat_leer_sesion: { ok: true, canal: 'creditos', mensajes } });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    P.ev('irA("chats")');
    await tick();
    const h = P.elems.cuerpo.innerHTML;
    assert.ok(h.indexOf('id="chHilo"') >= 0 && h.indexOf('id="chTexto"') >= 0 && h.indexOf('id="chEnviar"') >= 0);
    assert.match(h, /data-canal="servicio"[\s\S]*data-canal="cobranza"[\s\S]*data-canal="creditos"/, 'faltan los tres canales');
    assert.match(h, /Notas de voz: en camino/);
    /* El hilo: exactamente lo que devuelve hiloHTML con los mismos parámetros.
       En el banco no hay DOM sobre el que poner las etiquetas de autor, así
       que lo que queda en la caja es chat.js puro; en el navegador
       etiquetarAutores le agrega el .ch-quien sobre ese mismo DOM. */
    const esperado = CHAT.hiloHTML(mensajes, { yo: 'socio', textoVisto: 'Lo vieron', vacio: P.ev("canalDe('creditos').vacio") });
    assert.equal(P.elems.chHilo.innerHTML, esperado);
    assert.ok(esperado.indexOf('&lt;b&gt;x&lt;/b&gt;') >= 0, 'el texto del gerente no llegó escapado');
    assert.equal(P.ev('CH.ultimo'), 4);
    assert.equal(P.ev('CH.mensajes.length'), 4);
  });

  test('sesion.js: entra con el correo sintético, guarda sin contraseña, y un rpc sin sesión no toca la red', async () => {
    const n = nube(fn => (/grant_type=password/.test(fn)
      ? { access_token: 'tok-nuevo', refresh_token: 'ref-nuevo', expires_in: 3600, user: { user_metadata: { nombre: 'Ana' } } }
      : { ok: true }));
    const P = abrirPlataChat({ red: n.red });
    const r = await P.ev("SP.entrar(CFG, '300 111 2233', 'una-clave-larga')");
    assert.equal(r.ok, true);
    assert.equal(n.llamadas[0].cuerpo.email, U.correoDeTelefono('3001112233'));
    assert.equal(n.llamadas[0].cuerpo.email, '573001112233@tugarantia.net');
    assert.equal(n.llamadas[0].cab.apikey, P.ev('CFG.anon'));
    const g = JSON.parse(P.almacen.platachat_sesion);
    assert.equal(g.access_token, 'tok-nuevo');
    assert.equal(g.celular, '3001112233');
    assert.equal(g.nombre, 'Ana');
    assert.ok(JSON.stringify(g).indexOf('una-clave-larga') < 0, 'LA CONTRASEÑA QUEDÓ GUARDADA EN EL TELÉFONO');
    /* Sin sesión: rechaza de una, sin gastar red. */
    const antes = n.llamadas.length;
    await assert.rejects(() => P.ev("SP.rpc(CFG, null, 'mi_cuenta')"), e => e.sinSesion === true);
    assert.equal(n.llamadas.length, antes);
  });

  test('sesion.js: registrar va PRIMERO a la bandeja (registrar_abierto_app, anon) y DESPUÉS a Auth', async () => {
    const n = nube(fn => (/auth\/v1\/signup/.test(fn)
      ? { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }
      : { ok: true }));
    const P = abrirPlataChat({ red: n.red });
    const r = await P.ev("SP.registrar(CFG, { celular: '3001112233', nombre: 'Ana Pérez', cedula: '', clave: 'una-clave-larga' })");
    assert.equal(r.ok, true, r.motivo);
    assert.equal(n.llamadas[0].fn, 'registrar_abierto_app', 'no fue primero a la bandeja');
    assert.equal(n.llamadas[0].cab.Authorization, 'Bearer ' + P.ev('CFG.anon'), 'el registro va con el anon: todavía no hay sesión');
    assert.equal(n.llamadas[0].cuerpo.p_app, 'platachat');
    assert.equal(n.llamadas[0].cuerpo.p_celular, '3001112233');
    assert.ok(/auth\/v1\/signup/.test(n.llamadas[1].url), 'la cuenta en Auth va después');
    assert.equal(n.llamadas[1].cuerpo.data.app, 'platachat');
    /* Si la bandeja falla, Auth NO se toca: reintentar no duplica nada. */
    const m = nube(fn => (fn === 'registrar_abierto_app' ? { ok: false, motivo: 'datos' } : { ok: true }));
    const Q = abrirPlataChat({ red: m.red });
    const r2 = await Q.ev("SP.registrar(CFG, { celular: '3001112233', nombre: 'Ana Pérez', cedula: '', clave: 'una-clave-larga' })");
    assert.equal(r2.ok, false);
    assert.equal(m.llamadas.length, 1, 'con la bandeja caída igual intentó crear la cuenta en Auth');
  });

  /* ------------------------------------------------------------------
     Lo que la auditoría adversaria del 14-sep encontró en este mismo
     arnés, clavado para que no vuelva.
     ---------------------------------------------------------------- */

  test('UN SOLO LATIDO: abrir Chats y cambiar dos veces de canal deja exactamente un temporizador de 20 s', async () => {
    /* La primera versión arrancaba una cadena de temporizadores por cada
       chatTraer(true) —o sea por cada cambio de canal— y ninguna moría: tres
       cambios, tres chat_leer_sesion cada 20 s (cada uno con su UPDATE de
       visto). Medido en este arnés antes del arreglo: 1, 2, 3. */
    const n = nube({ mi_cuenta: CUENTA_PRUEBA, chat_leer_sesion: { ok: true, canal: 'creditos', mensajes: [] } });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    P.ev('irA("chats")'); await tick(); await tick();
    assert.equal(P.pendientes(20000).length, 1, 'abrir Chats no dejó exactamente un latido');
    P.ev('setCanal("servicio")'); await tick(); await tick();
    P.ev('setCanal("cobranza")'); await tick(); await tick();
    assert.equal(P.pendientes(20000).length, 1, 'cada cambio de canal suma un latido');
    /* Al vencer, trae UNA vez y se reprograma UNO. */
    const antes = n.llamadas.filter(l => l.fn === 'chat_leer_sesion').length;
    P.disparar(P.pendientes(20000)[0]); await tick(); await tick();
    assert.equal(n.llamadas.filter(l => l.fn === 'chat_leer_sesion').length, antes + 1);
    assert.equal(P.pendientes(20000).length, 1);
    /* Al salir de Chats el latido se apaga de una, no en su próximo vencimiento. */
    P.ev('irA("plata")');
    assert.equal(P.pendientes(20000).length, 0, 'el latido sigue vivo con Chats cerrado');
    /* Y al salir de la cuenta, también. */
    P.ev('irA("chats")'); await tick(); await tick();
    assert.equal(P.pendientes(20000).length, 1);
    P.ev('salir()');
    assert.equal(P.pendientes(20000).length, 0, 'el latido sigue vivo después de salir');
  });

  test('una traída VIEJA que llega tarde se bota: A→B→A no duplica mensajes ni resucita latidos', async () => {
    const n = nube((fn, cuerpo) => fn === 'mi_cuenta' ? CUENTA_PRUEBA
      : fn === 'chat_leer_sesion' ? { __colgar: true, ok: true, canal: cuerpo.p_canal,
          mensajes: [{ id: 1, de: 'panel', texto: 'de ' + cuerpo.p_canal, creado_en: '2026-09-14T10:00:00-05:00' }] }
      : { ok: true });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    P.ev('irA("chats")'); await tick();           /* Créditos, en vuelo */
    P.ev('setCanal("servicio")'); await tick();   /* Servicio, en vuelo */
    P.ev('setCanal("creditos")'); await tick();   /* Créditos otra vez, en vuelo */
    assert.equal(n.colgadas.length, 3, 'esperaba tres traídas en vuelo');
    n.colgadas[0](); await tick(); await tick();
    assert.equal(P.ev('CH.mensajes.length'), 0, 'la traída vieja de Créditos se sumó al hilo nuevo');
    n.colgadas[2](); await tick(); await tick();
    assert.equal(P.ev('CH.mensajes.length'), 1);
    n.colgadas[1](); await tick(); await tick();
    assert.equal(P.ev('CH.mensajes.length'), 1, 'la traída de Servicio, ya sin dueño, entró al hilo de Créditos');
    assert.ok(P.elems.chHilo.innerHTML.indexOf('de creditos') >= 0);
    assert.ok(P.elems.chHilo.innerHTML.indexOf('de servicio') < 0);
    assert.equal(P.pendientes(20000).length, 1, 'las traídas viejas resucitaron latidos');
  });

  test('si la nube CONTESTA con un error, no se culpa a la señal del cliente', async () => {
    /* Un 500 de mi_cuenta con sesión guardada decía «Sin conexión» y el
       cliente iba a revisar su wifi. Ahora dice que la nube contestó con un
       error, y sigue mostrando lo último bajado. */
    const n = nube(fn => (fn === 'mi_cuenta' ? { __estado: 500, message: 'boom' } : { ok: true }));
    const P = abrirPlataChat({ red: n.red });
    P.ev('SES = { access_token: "token-de-prueba", celular: "3001112233", nombre: "Ana", ultimo: ' +
         JSON.stringify(CUENTA_PRUEBA) + ', ultimoEl: "2026-09-13" }');
    await P.ev('cargarCuenta()');
    assert.equal(P.ev('SIN_NUBE'), false, 'un 500 se pintó como falta de señal');
    assert.match(P.ev('AVISO_NUBE'), /La nube contestó con un error \(500\)/);
    const h = P.elems.cuerpo.innerHTML;
    assert.ok(!/Sin conexión/.test(h));
    assert.match(h, /La nube contestó con un error \(500\)\. Vuelve a intentar en un momento\. Mientras tanto ves tus números al 13 sep 2026/);
    assert.equal(P.ev('S.cupo'), 145000, 'con la nube caída perdió los números que ya tenía');
    /* Y el fetch que RECHAZA sí es «sin conexión»: la marca red:true la pone
       sesion.js solo ahí. */
    const Q = abrirPlataChat();
    Q.ev('SES = { access_token: "t", celular: "3001112233", ultimo: ' + JSON.stringify(CUENTA_PRUEBA) + ', ultimoEl: "2026-09-13" }');
    await Q.ev('cargarCuenta()');
    assert.equal(Q.ev('SIN_NUBE'), true);
    assert.equal(Q.ev('AVISO_NUBE'), '');
  });

  test('sesion.js: un 5xx o un 429 no manda a «revisar» una contraseña que estaba bien ni a mirar el wifi', async () => {
    for (const estado of [500, 503, 429]) {
      const n = nube(fn => (/grant_type=password/.test(fn) ? { __estado: estado, message: 'down' } : { ok: true }));
      const P = abrirPlataChat({ red: n.red });
      const r = await P.ev("SP.entrar(CFG, '300 111 2233', 'una-clave-larga')");
      assert.equal(r.ok, false);
      assert.ok(!/Revísalos/.test(r.motivo), estado + ': culpa a los datos del cliente');
      assert.ok(!/internet/.test(r.motivo), estado + ': culpa a la señal del cliente');
      assert.equal(r.motivo, P.ev('SP.NUBE_CAIDA'));
      assert.equal(r.estado, estado);
    }
    /* Un 400 sigue siendo «datos malos»: Auth contesta 400 a la contraseña equivocada. */
    const m = nube(fn => (/grant_type=password/.test(fn) ? { __estado: 400, error: 'invalid_grant' } : { ok: true }));
    const Q = abrirPlataChat({ red: m.red });
    const r2 = await Q.ev("SP.entrar(CFG, '300 111 2233', 'otra-clave')");
    assert.match(r2.motivo, /Revísalos/);
    /* El registro: la bandeja caída (503) no es «revisa tu celular y tu nombre». */
    const k = nube(fn => (fn === 'registrar_abierto_app' ? { __estado: 503 } : { ok: true }));
    const R = abrirPlataChat({ red: k.red });
    const r3 = await R.ev("SP.registrar(CFG, { celular: '3001112233', nombre: 'Ana Pérez', cedula: '', clave: 'una-clave-larga' })");
    assert.equal(r3.motivo, R.ev('SP.NUBE_CAIDA'));
    assert.equal(k.llamadas.length, 1, 'con la bandeja caída igual fue a Auth');
    /* Y el rpc: un 502 no dice «revisa tu internet» y NO lleva red:true (por eso
       la página no lo pinta como «sin conexión»). */
    const j = nube(fn => (fn === 'mi_cuenta' ? { __estado: 502 } : { ok: true }));
    const T = abrirPlataChat({ red: j.red });
    T.ev(SESION_FALSA);
    await assert.rejects(() => T.ev("SP.rpc(CFG, SES, 'mi_cuenta')"),
      e => e.estado === 502 && !e.red && !/internet/.test(e.humano));
  });

  test('el gerente es una PERSONA: de="equipo" sale sin punteado y rotulado «tu gerente»; lo automático conserva su punteado', async () => {
    /* Hallazgo del 14-sep: la migración escribía al gerente como 'agente' y
       chat.js pinta 'agente' como máquina (ch-esauto, punteado): el cliente
       veía a su gerente como un robot, justo lo contrario de «Automático ·
       siempre marcado con línea punteada». Ahora la base escribe 'equipo',
       chat.js no lo marca, y esta página solo le pone nombre encima. */
    const mensajes = [
      { id: 1, de: 'socio',  texto: 'hola', creado_en: '2026-09-14T10:00:00-05:00' },
      { id: 2, de: 'equipo', texto: 'buenas, soy tu gerente', creado_en: '2026-09-14T10:05:00-05:00' },
      { id: 3, de: 'auto',   texto: 'tu pago', regla: 'cuando-pago', creado_en: '2026-09-14T10:06:00-05:00' },
      { id: 4, de: 'agente', texto: 'soy el asistente', creado_en: '2026-09-14T10:07:00-05:00' }
    ];
    const n = nube({ mi_cuenta: CUENTA_PRUEBA, chat_leer_sesion: { ok: true, canal: 'creditos', mensajes } });
    const P = abrirPlataChat({ red: n.red });
    P.ev(SESION_FALSA);
    await P.ev('cargarCuenta()');
    P.ev('irA("chats")'); await tick();
    const h = P.elems.chHilo.innerHTML;
    const clases = h.split('<div class="ch-msg ').slice(1).map(s => s.slice(0, s.indexOf('"')));
    assert.equal(clases.length, 4);
    assert.ok(!/ch-esauto/.test(clases[1]), 'el gerente (equipo) sale punteado como una máquina');
    assert.ok(/ch-suyo/.test(clases[1]), 'el gerente no sale del lado del negocio');
    assert.ok(/ch-esauto/.test(clases[2]), 'la regla automática perdió el punteado');
    assert.ok(/ch-esauto/.test(clases[3]), 'el asistente (agente) perdió el punteado');

    /* Sobre un DOM de mentira armado de ese HTML, etiquetarAutores pone el
       nombre y no toca ch-esauto en ninguna dirección. */
    const caja = domDe(h);
    P.ctx.cajaDePrueba = caja;
    P.ev('etiquetarAutores(cajaDePrueba)');
    assert.deepEqual(caja.nodos.map(x => x.burbuja.etiqueta), [null, 'tu gerente', 'automático · cuando-pago', null],
      'las etiquetas de autor no son las esperadas (el asistente conserva la de chat.js)');
    assert.ok(!caja.nodos[1].clases.has('ch-esauto'));
    assert.ok(caja.nodos[2].clases.has('ch-esauto') && caja.nodos[3].clases.has('ch-esauto'),
      'etiquetarAutores le quitó el punteado a una máquina');
    assert.equal(caja.nodos[2].burbuja.quitoAuto, true, 'no reemplazó la marca de chat.js: diría «automático» dos veces');
    assert.equal(caja.nodos[3].burbuja.quitoAuto, false);
    assert.ok(!/ch-esauto/.test(sinComentarios(PAGINA)), 'index.html decide por su cuenta qué es automático: eso es de chat.js');
  });
  test('SIN EL NÚMERO DE JOAN: quien no puede entrar deja un recado, sin sesión, y nada publica su WhatsApp (26-sep-2026)', async () => {
    /* Joan, 21-sep: «nada de compartir mi numero». play/ lo quitó ese día y
       PlataChat lo siguió publicando en tres sitios hasta el 26. */
    ['platachat/index.html', 'platachat/borrar-cuenta.html', 'descargas/platachat.html'].forEach(f =>
      assert.ok(!/wa\.me\/57|573103606348/.test(leer(f)), f + ' vuelve a publicar el WhatsApp de Joan'));
    assert.ok(!/WHATSAPP_OFICIAL/.test(sinComentarios(PAGINA)), 'volvió la constante con el número');
    assert.match(leer('platachat/borrar-cuenta.html'), /Déjanos un recado/, 'borrar la cuenta sin poder entrar no tiene camino');

    /* El recado corre de verdad: sin sesión, con la llave pública, a pedir_ayuda_clave. */
    const n = nube({ pedir_ayuda_clave: { ok: true } });
    const P = abrirPlataChat({ red: n.red });
    P.ev('pintarEntrar()');
    assert.match(P.elems.entrarCuerpo.innerHTML, /onclick="pintarRecado\(\)">¿Olvidaste tu contraseña o no puedes entrar\? Déjanos un recado/);
    P.ev('pintarRecado()');
    P.ev("$('rcCelular').value = '300 111 2233'; $('rcNota').value = 'quiero borrar mi cuenta'");
    await P.ev('mandarRecado()');
    await new Promise(r => setImmediate(r));
    const ll = n.llamadas.filter(x => x.fn === 'pedir_ayuda_clave');
    assert.equal(ll.length, 1, 'no se mandó el recado');
    assert.deepEqual(ll[0].cuerpo, { p_celular: '3001112233', p_nota: 'quiero borrar mi cuenta' });
    assert.equal(ll[0].cab.Authorization, 'Bearer ' + P.ev('CFG.anon'), 'el recado exige sesión: el que olvidó la contraseña no la tiene');
    assert.match(P.elems.entrarCuerpo.innerHTML, /Listo, lo recibimos/);

    /* Y un 404 (la función sin pegar) no culpa al internet de nadie. */
    const n2 = nube({ pedir_ayuda_clave: { __estado: 404 } });
    const P2 = abrirPlataChat({ red: n2.red });
    P2.ev('pintarRecado()');
    P2.ev("$('rcCelular').value = '3001112233'");
    await P2.ev('mandarRecado()');
    await new Promise(r => setImmediate(r));
    assert.match(P2.elems.errRecado.textContent, /todavía no están encendidos/);
    assert.ok(!/internet/.test(P2.elems.errRecado.textContent), 'culpa al internet de un 404 que es nuestro');
  });
});


/* ==========================================================================
 * 6. LLAMA A LA BASE POR NOMBRES QUE EXISTEN
 * «Lo que no se llama no existe» (chat.test.js). Y al revés: lo que se llama
 * y no existe es un 404 que el cliente ve como «esta parte todavía no está
 * encendida». Las dos direcciones se barren acá.
 * ======================================================================== */
describe('PlataChat: llama a la base por su nombre, y solo a lo que existe', () => {

  /* Los nombres que la página y sesion.js mandan a /rest/v1/rpc/, sacados de
     los dos sitios donde pueden estar: la URL escrita y el nombre pasado a
     rpc(CFG, SES, '…'). */
  function llamadasDe(texto) {
    const s = new Set();
    for (const m of texto.matchAll(/rpc\/([a-z_0-9]+)/g)) s.add(m[1]);
    for (const m of texto.matchAll(/\.rpc\(\s*CFG\s*,\s*SES\s*,\s*'([a-z_0-9]+)'/g)) s.add(m[1]);
    return s;
  }
  const LLAMADAS = new Set([...llamadasDe(PAGINA), ...llamadasDe(SESION_JS)]);

  /* Lo que la base define: todo `create or replace function public.x(` de
     base/*.sql, incluidas las dos migraciones nuevas de PlataChat. */
  const DEFINIDAS = new Set();
  fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /\.sql$/i.test(f)).forEach(f => {
    for (const m of leer('base/' + f).matchAll(/create or replace function public\.([a-z_0-9]+)\s*\(/gi)) DEFINIDAS.add(m[1].toLowerCase());
  });

  test('las siete obligatorias se llaman por su nombre exacto', () => {
    RPC_OBLIGATORIAS.forEach(fn => assert.ok(LLAMADAS.has(fn), 'la página no llama a ' + fn));
  });

  test('y NINGUNA llamada va a una función que no exista en base/*.sql', () => {
    assert.ok(DEFINIDAS.size > 50, 'no encontré las funciones de base/*.sql');
    const huerfanas = [...LLAMADAS].filter(fn => !DEFINIDAS.has(fn));
    assert.deepEqual(huerfanas, [], 'la página llama a funciones que no existen: ' + huerfanas.join(', '));
  });

  test('usa registrar_abierto_APP, nunca la vieja registrar_abierto', () => {
    /* Una sobrecarga con otra firma dejaría a PostgREST sin saber cuál
       llamar; por eso la función nueva tiene nombre nuevo. Y la página tiene
       que llamar a la nueva, que es la que etiqueta el registro con la app. */
    assert.ok(!LLAMADAS.has('registrar_abierto'), 'la página llama a la registrar_abierto vieja');
    assert.ok(!/rpc\/registrar_abierto['"\s]/.test(SESION_JS));
    assert.ok(!/rpc\/registrar_abierto['"\s]/.test(PAGINA));
  });

  test('la app del cliente no llama a lo que es de Joan ni a los ayudantes internos', () => {
    /* comprobantes_de, comprobante_imagen y chat_responder_equipo se llaman
       desde el CRM con clave o con rol; las internas (clave_ok, limpiar_fallos…)
       están cerradas a internet desde el 28-ago. Si alguna aparece acá es un
       cable al lugar equivocado: o falla siempre, o abre una puerta. */
    ['comprobantes_de', 'comprobante_imagen', 'chat_responder_equipo', 'clave_ok', 'limpiar_fallos',
     'anotar_fallo', 'puede_intentar', 'puede_intentar_tope', 'huella_codigo', 'chat_puede_escribir',
     'solo_digitos', 'llave_de_sesion', 'celular_de_sesion', 'mi_alcance', 'sincronizar_socios',
     'listar_registros', 'listar_solicitudes', 'chat_conversaciones', 'chat_de', 'chat_responder']
      .forEach(fn => assert.ok(!LLAMADAS.has(fn), 'la app del cliente llama a ' + fn));
  });

  test('todo rpc con sesión lleva el token como Bearer y el anon como apikey', () => {
    assert.match(SESION_JS, /Authorization: 'Bearer ' \+ sesion\.access_token/);
    assert.match(SESION_JS, /apikey: cfg\.anon/);
    /* La página no arma ni un fetch por su cuenta: todo pasa por sesion.js.
       Así hay UNA forma de hablar con la base y un solo sitio donde
       refrescar el token. */
    assert.ok(!/\bfetch\s*\(/.test(sinComentarios(PAGINA)), 'index.html llama a fetch por su cuenta');
  });
});


/* ==========================================================================
 * 7. NINGÚN PERMISO PROHIBIDO
 * La lista vive en app/cuenta.js con su porqué; acá solo se barre que ningún
 * archivo de PlataChat —ni la página, ni el manifiesto, ni el envoltorio de
 * Android— la nombre.
 * ======================================================================== */
describe('PlataChat: ningún permiso prohibido', () => {

  const ARCHIVOS = fs.readdirSync(path.join(RAIZ, 'platachat'))
    .filter(f => /\.(html|js|css|webmanifest|json)$/.test(f)).map(f => 'platachat/' + f)
    .concat(['android/twa-platachat.json', 'descargas/platachat.html']);

  test('la lista de cuenta.js sigue teniendo los siete de siempre', () => {
    assert.ok(U.PERMISOS_PROHIBIDOS.length >= 7);
    assert.ok(U.PERMISOS_PROHIBIDOS.some(p => p.permiso === 'READ_SMS'));
    assert.ok(U.PERMISOS_PROHIBIDOS.some(p => p.permiso === 'READ_CONTACTS'));
  });

  ARCHIVOS.forEach(f => {
    test(f + ' no nombra ninguno', () => {
      const t = leer(f);
      U.PERMISOS_PROHIBIDOS.forEach(p => assert.ok(t.indexOf(p.permiso) < 0, f + ' pide ' + p.permiso + ': ' + p.porque));
    });
  });

  test('no pide el permiso de notificaciones mientras no haya con qué mandar una', () => {
    /* Copia del centinela de vitrina.test.js: pedir permiso «para después»
       es lo que hacen las apps que uno desinstala. El envoltorio nace con
       enableNotifications true (para no reinstalar el día que lleguen), pero
       la PÁGINA no pide nada hasta que exista el emisor en sw.js. */
    const hayEmisor = /addEventListener\(\s*['"]push['"]/.test(leer('sw.js'));
    if (hayEmisor) return;
    assert.ok(!/Notification\.requestPermission|requestPermission\(\)/.test(PAGINA),
      'platachat/index.html pide el permiso de notificaciones y todavía no hay con qué mandar una');
  });
});


/* ==========================================================================
 * 8. EL MANIFIESTO Y EL ENVOLTORIO
 * Bubblewrap descarga los iconos por URL y Android identifica la app por el
 * packageId: un icono que no existe es un build que falla, y un id cambiado
 * es una app que ya nadie puede actualizar.
 * ======================================================================== */
describe('PlataChat: el manifiesto y el envoltorio de Android', () => {

  const MANIFIESTO = JSON.parse(leer('platachat/app.webmanifest'));
  const TWA = JSON.parse(leer('android/twa-platachat.json'));

  /* Firma PNG y cabecera IHDR: los ocho bytes fijos, y ancho/alto en big
     endian a partir del byte 16. Con eso se sabe que el archivo es un PNG de
     verdad y del tamaño que el manifiesto promete. */
  function png(f) {
    const b = fs.readFileSync(path.join(RAIZ, f));
    assert.equal(b.slice(0, 8).toString('hex'), '89504e470d0a1a0a', f + ' no tiene firma PNG');
    assert.equal(b.slice(12, 16).toString(), 'IHDR', f + ' no trae IHDR');
    return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  }

  test('app.webmanifest: id, alcance, arranque y colores irreversibles', () => {
    assert.equal(MANIFIESTO.id, '/platachat/');
    assert.equal(MANIFIESTO.scope, './');
    assert.equal(MANIFIESTO.start_url, 'index.html');
    assert.equal(MANIFIESTO.display, 'standalone');
    assert.equal(MANIFIESTO.orientation, 'portrait');
    assert.equal(MANIFIESTO.lang, 'es-CO');
    assert.equal(MANIFIESTO.short_name, 'PlataChat');
    assert.equal(MANIFIESTO.name, 'PlataChat · tu crédito por el chat');
    assert.ok(MANIFIESTO.categories.indexOf('finance') >= 0);
    assert.equal(MANIFIESTO.theme_color.toUpperCase(), '#0C0A0B');
    assert.equal(MANIFIESTO.background_color.toUpperCase(), '#0C0A0B');
    /* El mismo negro que la barra del navegador en index.html: si no, la app
       parpadea de un color a otro entre que abre y que pinta. */
    assert.match(PAGINA, new RegExp('<meta name="theme-color" content="' + MANIFIESTO.theme_color + '">', 'i'));
  });

  test('los iconos del manifiesto existen, son PNG y miden lo que dicen', () => {
    assert.ok(MANIFIESTO.icons.length >= 3);
    assert.ok(MANIFIESTO.icons.some(i => i.purpose === 'maskable'), 'falta el icono maskable');
    MANIFIESTO.icons.forEach(i => {
      const f = 'platachat/' + i.src;
      assert.ok(existe(f), 'no existe ' + f);
      assert.equal(i.type, 'image/png');
      const d = png(f);
      assert.equal(d.ancho + 'x' + d.alto, i.sizes, f + ' no mide lo que el manifiesto promete');
    });
    /* El de iPhone lo enlaza index.html directamente. */
    assert.match(PAGINA, /<link rel="apple-touch-icon" href="icono-180.png">/);
    const d = png('platachat/icono-180.png');
    assert.equal(d.ancho, 180);
  });

  test('twa-platachat.json: paquete propio, notificaciones encendidas, arranque en /platachat/', () => {
    assert.equal(TWA.packageId, 'co.tugarantia.platachat');
    assert.equal(TWA.enableNotifications, true);
    assert.equal(TWA.startUrl, '/platachat/index.html');
    assert.equal(TWA.host, 'tugarantia.net');
    assert.equal(TWA.fullScopeUrl, 'https://tugarantia.net/');
    assert.equal(TWA.webManifestUrl, 'https://tugarantia.net/platachat/app.webmanifest');
    assert.equal(TWA.appVersionName, '1.0.0');
    assert.equal(TWA.appVersionCode, 1);
    assert.equal(TWA.themeColor.toUpperCase(), '#0C0A0B');
    /* Los iconos que Bubblewrap va a descargar son archivos que existen. */
    [TWA.iconUrl, TWA.maskableIconUrl].forEach(u => {
      const f = u.replace('https://tugarantia.net/', '');
      assert.ok(existe(f), 'el envoltorio apunta a ' + u + ' y no existe');
      png(f);
    });
  });

  test('es OTRO paquete que el de Tu Garantía, con la MISMA llave de firma', () => {
    /* Dos apps con el mismo packageId se pisan al instalar; dos llaves
       distintas serían dos huellas en assetlinks y una segunda llave que
       perder. */
    if (!existe('android/twa-manifest.json')) return;
    const socio = JSON.parse(leer('android/twa-manifest.json'));
    assert.notEqual(TWA.packageId, socio.packageId, 'PlataChat pisaría la app del socio al instalarse');
    assert.deepEqual(TWA.signingKey, socio.signingKey, 'PlataChat se firma con otra llave');
  });

  test('descargas/platachat.html no enlaza un .apk que no exista, y el botón apagado lo dice', () => {
    const t = sinComentarios(leer('descargas/platachat.html'));
    const apks = [...t.matchAll(/href="([^"]*\.apk)"/g)].map(m => m[1]);
    apks.forEach(a => assert.ok(existe(path.join('descargas', a)), 'enlaza ' + a + ' y no existe: un botón de descarga muerto'));
    assert.match(t, /<button class="btn btn-quieto" type="button" disabled aria-disabled="true">[\s\S]*?El instalador para Android llega cuando Joan lo publique/);
    assert.match(t, /href="\.\.\/platachat\/"/, 'no lleva a la app publicada');
    assert.match(t, /Añadir a pantalla de inicio/, 'no explica cómo instalarla hoy desde Chrome');
    /* Los enlaces relativos que sí promete, existen. */
    ['../legal/terminos.html', '../legal/privacidad.html', 'index.html', '../index.html', '../platachat/icono-192.png']
      .forEach(h => assert.ok(existe(path.join('descargas', h)), 'descargas/platachat.html enlaza ' + h + ' y no existe'));
  });

  test('y los enlaces legales de la app existen', () => {
    ['../legal/terminos.html', '../legal/privacidad.html', 'borrar-cuenta.html']
      .forEach(h => {
        assert.ok(PAGINA.indexOf('href="' + h + '"') >= 0, 'index.html no enlaza ' + h);
        assert.ok(existe(path.join('platachat', h)), 'index.html enlaza ' + h + ' y no existe');
      });
  });
});


/* ==========================================================================
 * 9. LA PIEL DEFINE LO QUE LA PÁGINA USA
 * Un token que la página pide y la piel no define no es un error: es un
 * color que no se pinta, en silencio. Y un hex fuera de :root es la copia
 * que nadie declaró.
 * ======================================================================== */
describe('PlataChat: la piel define cada token que la página usa', () => {

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* El :root principal: el primer bloque, hasta su llave de cierre. */
  const ROOT = (ESTILO.match(/:root\s*\{([\s\S]*?)\n\}/) || [, ''])[1];
  const valorDe = (bloque, token) => {
    const m = new RegExp(esc(token) + '\\s*:\\s*([^;]+);').exec(bloque);
    return m ? m[1].trim() : null;
  };

  test('los tokens del contrato, con sus valores', () => {
    const TOKENS = {
      '--laca': '#0C0A0B', '--papel': '#FFFFFF', '--fondo': '#F3F4F6', '--tinta': '#0C0A0B', '--luz': '#FFFFFF', '--sombra': '#000000',
      '--marca': '#07C160', '--marca-oscuro': '#06AD56', '--marca-tinte': '#E7F8EE', '--marca-texto': '#04803F', '--marca-laca': '#3DD97F',
      '--plata': '#C9CDD4', '--plata-luz': '#F2F4F7', '--plata-sombra': '#8B929E', '--plata-tinta': '#5C6370',
      '--ambar': '#9A5B12', '--gris': '#6E7480', '--linea': '#E3E6EB', '--blanco-laca': '#F7F8FA',
      '--r': '16px', '--e1': '4px', '--e2': '8px', '--e3': '12px', '--e4': '20px'
    };
    assert.ok(ROOT.length > 500, 'no encontré el bloque :root de estilo.css');
    Object.keys(TOKENS).forEach(k => {
      const v = valorDe(ROOT, k);
      assert.ok(v !== null, 'estilo.css no define ' + k);
      assert.equal(v.toUpperCase(), TOKENS[k].toUpperCase(), k + ' vale ' + v + ' y el contrato dice ' + TOKENS[k]);
    });
    ['--ambar-papel', '--ambar-filete', '--ambar-tinta'].forEach(k => {
      assert.match(valorDe(ROOT, k) || '', /color-mix|var\(--ambar\)/, k + ' no sale del ámbar con color-mix como socio.html');
    });
    assert.match(valorDe(ROOT, '--placa') || '', /#23262B[\s\S]*#121316[\s\S]*#0C0A0B/i, '--placa no es el degradado de la placa');
  });

  test('los ALIAS --rojo y --rojo-tinte apuntan al verde, para chat.css', () => {
    assert.equal(valorDe(ROOT, '--rojo'), 'var(--marca)');
    assert.equal(valorDe(ROOT, '--rojo-tinte'), 'var(--marca-tinte)');
    /* Y la piel no escribe --rojo por su cuenta: los alias son para chat.css
       y para nadie más. (Fuera de los comentarios: la ley de la cabecera lo
       nombra para explicarlo, y eso no pinta nada.) */
    const reglas = ESTILO.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/var\(--rojo/.test(reglas), 'estilo.css usa var(--rojo…): acá se escribe --marca');
  });

  test('modo oscuro con los tres bloques, como socio.html', () => {
    assert.match(ESTILO, /@media \(prefers-color-scheme:dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/);
    assert.match(ESTILO, /:root\[data-theme="dark"\]\s*\{/);
    assert.match(ESTILO, /:root\[data-theme="light"\]\s*\{/);
  });

  test('cada var(--x) que usan index.html y borrar-cuenta.html está definida en la piel', () => {
    const define = new Set([...ESTILO.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
    ['platachat/index.html', 'platachat/borrar-cuenta.html'].forEach(f => {
      const usa = new Set([...leer(f).matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
      const faltan = [...usa].filter(v => !define.has(v));
      assert.deepEqual(faltan, [], f + ' usa tokens que la piel no define: ' + faltan.join(', '));
    });
  });

  test('ningún color a mano fuera de :root — ni en la piel ni en los <style> de las páginas', () => {
    const sinRoot = ESTILO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:root[^{]*\{[^}]*\}/g, '');
    const hex = [...sinRoot.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
    assert.deepEqual(hex, [], 'estilo.css tiene colores a mano fuera de :root: ' + hex.join(' '));
    ['platachat/index.html', 'platachat/borrar-cuenta.html'].forEach(f => {
      const estilo = (leer(f).match(/<style>[\s\S]*?<\/style>/) || [''])[0];
      const h = [...estilo.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
      assert.deepEqual(h, [], f + ' pinta con hex en su <style>: ' + h.join(' '));
    });
  });

  test('las clases que la página usa las define la piel (o chat.css, o su propio <style>)', () => {
    /* Las de la anatomía compartida: si una falta, esa pieza sale sin forma
       y nadie lo nota hasta abrirla en un teléfono. */
    const CLASES = ['wrap', 'card', 'laca', 'lustre', 'etq', 'cifra', 'plata', 'fila', 'sep', 'btn', 'marca', 'claro',
                    'seg', 'chips', 'chip', 'aviso', 'ambar', 'info', 'pie', 'nav', 'panel', 'muted', 'oculto', 'sub', 'tit',
                    'monedas', 'moneda', 'media', 'lingote', 'brillo', 'entrada-chat', 'pildora', 'enviar', 'quienes', 'q',
                    'avatar', 'ch-quien', 'ch-hilo', 'ch-vacio', 'ch-cuenta', 'tarjeta-propuesta'];
    const todo = ESTILO + (PAGINA.match(/<style>[\s\S]*?<\/style>/) || [''])[0] + leer('app/chat.css');
    CLASES.forEach(c => assert.ok(new RegExp('\\.' + esc(c) + '(?![a-z0-9_-])').test(todo), 'nadie define .' + c));
    assert.match(ESTILO, /input\[type=range\]\s*\{[^}]*accent-color:\s*var\(--marca\)/, 'la barra de la calculadora no va en verde');
    assert.match(ESTILO, /prefers-reduced-motion/, 'las animaciones no se apagan con reduced-motion');
  });
});


/* ==========================================================================
 * 10. LO QUE LA AUDITORÍA ADVERSARIA DEL 14-SEP DEJÓ CLAVADO
 * Los cables que se cayeron en la revisión y que no tienen dueño en las
 * baterías de arriba: el sello de versión, la receta para los archivos que
 * esta fase obliga a tocar y no se tocan, y «un solo dueño» para cada pieza
 * de la piel (la página traía copias de la bienvenida, la cabecera, la
 * barra del chat, los avatares y las monedas, y ganaba una u otra según la
 * especificidad).
 * ======================================================================== */
describe('PlataChat: lo que la auditoría del 14-sep dejó clavado', () => {

  test('el sello VERSION_APP se mueve con el archivo (la regla de VERSION_PLAY en motor.test.js)', () => {
    const sello = (PAGINA.match(/var VERSION_APP = '(\d{4}-\d{2}-\d{2})'/) || [])[1];
    assert.ok(sello, 'platachat/index.html perdió su sello de versión');
    const MESES = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
                    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' };
    const fechas = [...PAGINA.matchAll(/(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)-(\d{4})/g)]
      .map(m => m[3] + '-' + MESES[m[2]] + '-' + String(m[1]).padStart(2, '0'));
    assert.ok(fechas.length > 0, 'la página no anota fechas de cambio en sus comentarios');
    const ultima = fechas.sort().pop();
    assert.ok(sello >= ultima, 'el sello dice ' + sello + ' pero el archivo anota un cambio del ' + ultima +
      ': súbelo (y CACHE en sw.js cuando platachat/ esté en su lista)');
    /* El pie de cada pantalla lo lee de la misma variable: dos literales serían dos verdades. */
    assert.ok((PAGINA.match(/VERSION_APP/g) || []).length >= 3);
  });

  test('la RECETA para los archivos ajenos existe, nombra cada parche y cuadra con sw.js y assetlinks', () => {
    assert.ok(existe('RECETA-PLATACHAT.md'),
      'falta RECETA-PLATACHAT.md: los archivos ajenos que esta fase obliga a tocar no tienen receta');
    const r = leer('RECETA-PLATACHAT.md');
    ['sw.js', '.well-known/assetlinks.json', 'pruebas/motor.test.js', 'app/chat.js', 'pruebas/chat.test.js', 'PLAN-PLATACHAT.md']
      .forEach(f => assert.ok(r.indexOf(f) >= 0, 'la receta no nombra ' + f));
    /* Cada archivo que la receta manda precargar existe. */
    const lista = [...r.matchAll(/^\s*'((?:platachat|app)\/[^']+)',?\s*$/mg)].map(m => m[1]).filter(f => !/\/$/.test(f));
    assert.ok(lista.length >= 10, 'la receta de sw.js no trae la lista de archivos de platachat/');
    lista.forEach(f => assert.ok(existe(f), 'la receta manda precargar ' + f + ' y no existe'));
    /* La huella de assetlinks es la de la app del socio: misma llave de firma. */
    const huella = JSON.parse(leer('.well-known/assetlinks.json'))[0].target.sha256_cert_fingerprints[0];
    assert.ok(r.indexOf(huella) >= 0, 'la receta de assetlinks no lleva la huella de la llave de firma');
    assert.ok(r.indexOf('co.tugarantia.platachat') >= 0);
    /* El CACHE de sw.js se mueve con cada publicación de la otra sesión (v45
       → v48 en la misma tarde del 14-sep), así que la receta NO clava un
       número: manda subir al siguiente del que haya. Lo que se vigila es que
       lo diga con esas palabras y que sw.js siga teniendo un CACHE que subir. */
    const sw = leer('sw.js');
    const hoy = Number((sw.match(/const CACHE = 'tugarantia-v(\d+)'/) || [])[1]);
    assert.ok(hoy > 0, 'sw.js perdió su CACHE');
    assert.match(r, /el siguiente al que haya/, 'la receta ya no dice que CACHE sube al siguiente número');
    assert.match(r, /const CACHE = 'tugarantia-v/, 'la receta ya no muestra la línea de CACHE');
    /* Y el ancla del parche sigue siendo la última entrada de ARCHIVOS. */
    const ultima = (r.match(/después de `'([^']+)'` \(la última/) || [])[1];
    assert.ok(ultima, 'la receta perdió el ancla de ARCHIVOS');
    if (!/'platachat\/index\.html'/.test(sw)) {
      assert.ok(sw.indexOf("'" + ultima + "'") >= 0, 'sw.js ya no tiene la entrada ' + ultima + ' que la receta usa de ancla');
    }
  });

  test('un solo dueño: la bienvenida, la cabecera, la barra del chat, los avatares y las monedas son de la piel', () => {
    const estiloPagina = (PAGINA.match(/<style>[\s\S]*?<\/style>/) || [''])[0].replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/#hola|\.pc-hola|\.pc-cab|\.pc-marca|\.pc-mic|\.pc-foto|\.pc-enviar|\.pc-pildora|\.pc-quien|\.nav\b/.test(estiloPagina),
      'index.html vuelve a definir por su cuenta una pieza que ya define la piel');
    /* La bienvenida: el marcado que estilo.css pinta, pieza por pieza. */
    const hola = (PAGINA.match(/<div id="hola"[\s\S]*?<\/div>\s*<script>/) || [''])[0];
    assert.ok(hola.length > 200, 'no encontré el bloque #hola');
    ['placa', 'aura', 'grano', 'vineta', 'marco', 'sello-caja', 'halo', 'sello', 'burbujita', 'nombre', 'lema', 'filete', 'version']
      .forEach(c => {
        assert.ok(hola.indexOf('class="' + c + '"') >= 0, 'la bienvenida no trae .' + c);
        assert.match(ESTILO, new RegExp('#hola \\.' + c + '\\b'), 'la piel no pinta #hola .' + c);
      });
    assert.ok(!/class="pc-hola"/.test(PAGINA));
    /* La cabecera: .cab > .wrap > .arriba > .logo (+ .lado), en las dos pantallas y en borrar-cuenta. */
    const cab = /class="laca cab">[\s\S]*?class="wrap">\s*<div class="arriba">\s*<span class="logo"><svg[^>]*>[\s\S]*?<\/svg><span>Plata<b>Chat<\/b><\/span><\/span>/g;
    assert.equal((PAGINA.match(cab) || []).length, 2, 'las dos cabeceras de index.html no son .cab/.logo de la piel');
    assert.equal((leer('platachat/borrar-cuenta.html').match(cab) || []).length, 1, 'la cabecera de borrar-cuenta.html no es .cab/.logo de la piel');
    assert.ok(!/pc-cab|pc-marca/.test(leer('platachat/borrar-cuenta.html')));
    assert.match(PAGINA, /<span class="lado" id="uResumen">/);
    ['.cab{', '.logo{', '.cab .lado{', '.cab .arriba{', '.cab h1{'].forEach(s => assert.ok(ESTILO.indexOf(s) >= 0, 'la piel perdió ' + s));
    /* La barra del chat y los avatares, con las clases de la piel y sin salvavidas. */
    assert.match(PAGINA, /<button type="button" class="mic" disabled title="Notas de voz: en camino"/);
    assert.match(PAGINA, /<div class="pildora"><textarea id="chTexto"/);
    assert.match(PAGINA, /<button type="button" class="enviar" id="chEnviar"/);
    assert.match(PAGINA, /<div class="q"><div class="avatar">P<\/div>/);
    assert.match(PAGINA, /<div class="q"><div class="avatar plata">G<\/div>/);
    assert.match(PAGINA, /<div class="q"><div class="avatar auto">/);
    assert.ok(!/class="[^"]*\b(ini|pc-quien|pc-pildora|pc-enviar|pc-mic|pc-foto)\b/.test(PAGINA));
    /* Las monedas: el degradado con el id y las paradas .m1…m4 que la piel
       espera, y la geometría con .cara/.aro/.signo/.molde/.cuerpo. */
    assert.match(PAGINA, /<radialGradient id="plata-moneda"[^>]*>\s*<stop offset="0" class="m1"\/><stop offset="\.42" class="m2"\/>\s*<stop offset="\.8" class="m3"\/><stop offset="1" class="m4"\/>/);
    ['<circle class="cara"', '<circle class="aro"', '<text class="signo"', '<circle class="molde"', '<polygon class="cuerpo"', 'class="moneda vacia"']
      .forEach(s => assert.ok(PAGINA.indexOf(s) >= 0, 'las monedas no usan ' + s));
    assert.ok(!/pc-plata-moneda|pc-plata-lingote|url\(#pc-/.test(PAGINA), 'queda un degradado propio de la página');
    ['.moneda .cara{', '.moneda .aro{', '.moneda .signo{', '.lingote .cuerpo{', '.m1{', '.monedas .pila{', '.monedas-pie{', '.cupo-frase{']
      .forEach(s => assert.ok(ESTILO.indexOf(s) >= 0, 'la piel perdió ' + s));
  });
});
