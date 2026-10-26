'use strict';
/* ==========================================================================
 * LAS TRES PANTALLAS, EL MISMO RELOJ — 26 de octubre de 2026 (chat-1)
 *
 *   node --test pruebas/las-tres-pantallas-el-mismo-reloj.test.js
 *
 * POR QUÉ EXISTE. chat-1 se construyó en tres ramas, una por pantalla
 * (panel/crm.html, panel/espejo.html, app/socio.html), y las tres tenían que
 * mover la conversación abierta con el MISMO módulo, app/chat-vivo.js, y el
 * mismo contrato (la cabecera de ese archivo lo escribe). Cada rama tiene su
 * prueba grande (chat-1-crm, chat-1-espejo, chat-1-socio), pero cada una mira
 * SU página: ninguna se entera si una de las otras dos se descuelga —carga
 * una copia propia del reloj, deja de pasar `caja` y el reloj no se para al
 * cerrar, pasa `estaOculta` y pide el hilo escondida (lo que se pide queda
 * «Lo vio»), o llama a un nombre que el módulo no tiene—. Eso ya pasó una vez
 * en este repositorio con `aplicarVars` del espejo («ES UNA SEGUNDA COPIA Y
 * VA A DERIVAR»), y es la razón de que el reloj viva en un archivo aparte.
 *
 * Lo que vigila, sobre lo ESCRITO en las tres páginas (sin comentarios) y en
 * sw.js, y sobre el módulo cargado de verdad:
 *   1. las tres cargan app/chat-vivo.js con <script src>, y sw.js lo precarga
 *      con la misma dirección (si un día alguien le pone ?v=, va en los dos
 *      lados o el teléfono sin señal recibe una página HTML por .js);
 *   2. cada hilo se arma con ChatVivo.hilo({...}) y el contrato entero
 *      —pedir, pintar, caja, esMio— y NUNCA con `estaOculta`: la regla de no
 *      pedir escondida es del módulo, no de cada página;
 *   3. `esMio` dice de qué lado está quien mira: el negocio en el CRM y en el
 *      espejo, el socio en la app, y el asesor (que en su CRM es el miembro,
 *      traducido a 'socio' por la base) en su propio hilo. Un bloque copiado
 *      de una pantalla a otra sin cambiar esto deja de bajar lo que uno mismo
 *      acaba de mandar;
 *   4. ninguna página llama a un nombre que el módulo no exporta;
 *   5. ninguna página arma a mano un reloj de 8 s para el hilo;
 *   6. honestidad: ninguna dice «tiempo real», y el CRM ya no promete el globo
 *      «aunque tengas el CRM en otra pestaña» con la frase vieja.
 *
 * Falla con c992a83 (chat-1 solo con el CRM): el espejo y la app del socio no
 * cargaban el módulo. Pasa con las tres ramas fusionadas.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* Qué pide cada página y de qué lado está quien la mira. `cajas` son las cajas
   del hilo que cada página tiene que armar con el módulo, con su lado. */
const PAGINAS = {
  'panel/crm.html':    { src: '../app/chat-vivo.js', cajas: { chHilo: 'negocio', eqHilo: 'negocio', hiloJefe: 'socio' } },
  'panel/espejo.html': { src: '../app/chat-vivo.js', cajas: { mHilo: 'negocio' } },
  'app/socio.html':    { src: 'chat-vivo.js',        cajas: { chHilo: 'socio' } }
};
const FUENTE = Object.fromEntries(Object.keys(PAGINAS).map(f => [f, leer(f)]));
const CODIGO = Object.fromEntries(Object.keys(PAGINAS).map(f => [f, sinComentarios(FUENTE[f])]));
const SW = leer('sw.js');
const MODULO = require('../app/chat-vivo.js');

/* Los bloques `ChatVivo.hilo({ ... })` (o `VIVO.hilo`, el alias de la app del
   socio) de una página, con las llaves balanceadas y sin dejarse engañar por
   una llave dentro de una cadena o de un comentario. */
function bloquesHilo(src) {
  const re = /\b(?:ChatVivo|VIVO)\.hilo\(\{/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const i = m.index + m[0].length - 1;
    let prof = 0, j = i, cadena = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (cadena) { if (c === '\\') { j++; continue; } if (c === cadena) cadena = null; continue; }
      if (c === "'" || c === '"' || c === '`') { cadena = c; continue; }
      if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j + 2) + 1; continue; }
      if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
      if (c === '{') prof++;
      else if (c === '}' && --prof === 0) break;
    }
    out.push(src.slice(i, j + 1));
  }
  return out;
}
const campo = (bloque, k) => new RegExp('(^|[{,\\s])' + k + '\\s*[:,]').test(bloque);
/* La caja se pide con getElementById (CRM, espejo) o con el atajo $() de la
   app del socio: las dos formas nombran el mismo id. */
const cajaDe = bloque => (/caja\s*:[\s\S]*?(?:getElementById|\$)\('([A-Za-z]+)'\)/.exec(bloque) || [])[1];
const ladoDe = bloque => (/esMio\s*:[\s\S]*?ladoDe\([^)]*\)\s*===\s*'(negocio|socio)'/.exec(bloque) || [])[1];

/* ========================================================================== */
describe('1. las tres cargan el mismo archivo, y sw.js lo precarga con la misma dirección', () => {

  const precarga = SW.slice(SW.indexOf('const ARCHIVOS = ['), SW.indexOf('].map(f => BASE + f)'));
  const enSw = (/'app\/chat-vivo\.js(\?v=\d+)?'/.exec(precarga) || [])[0];

  test('sw.js precarga app/chat-vivo.js (la lección de la v18: lo que no está en la lista llega como HTML)', () => {
    assert.ok(enSw, 'app/chat-vivo.js no está en la lista de precarga de sw.js');
  });

  for (const [f, p] of Object.entries(PAGINAS)) {
    test(f + ' lo carga con <script src>, después de app/chat.js, y con la misma versión que sw.js', () => {
      const re = new RegExp('<script src="' + p.src.replace(/[.\/]/g, '\\$&') + '(\\?v=\\d+)?"></script>');
      const m = re.exec(FUENTE[f]);
      assert.ok(m, f + ' no carga app/chat-vivo.js: su conversación no se mueve sola');
      const versionPagina = m[1] || '';
      const versionSw = (/\?v=\d+/.exec(enSw || '') || [''])[0];
      assert.equal(versionPagina, versionSw, f + ' pide chat-vivo.js con «' + versionPagina + '» y sw.js lo precarga con «' + versionSw + '»: son dos archivos distintos para la caché');
      /* El pintor (app/chat.js) primero: las páginas le preguntan CHAT.ladoDe
         dentro de esMio, y leerlo en el mismo orden en las tres evita que una
         copia vieja de una se parezca a la nueva de otra. */
      const chat = FUENTE[f].indexOf('<script src="' + p.src.replace('chat-vivo', 'chat'));
      assert.ok(chat >= 0 && chat < m.index, f + ' carga chat-vivo.js antes que chat.js');
    });
  }
});

/* ========================================================================== */
describe('2. cada hilo se arma con el contrato entero, y nunca con estaOculta', () => {

  for (const [f, p] of Object.entries(PAGINAS)) {
    test(f + ': ' + Object.keys(p.cajas).join(', '), () => {
      const bloques = bloquesHilo(CODIGO[f]);
      assert.ok(bloques.length >= Object.keys(p.cajas).length,
        f + ' arma ' + bloques.length + ' hilo(s) con ChatVivo.hilo y debería armar al menos ' + Object.keys(p.cajas).length);
      const vistas = {};
      for (const b of bloques) {
        for (const k of ['pedir', 'pintar', 'caja', 'esMio']) {
          assert.ok(campo(b, k), f + ': un ChatVivo.hilo({...}) sin `' + k + '`:\n' + b.slice(0, 200));
        }
        assert.ok(!campo(b, 'estaOculta'), f + ': un hilo con `estaOculta` propio. Escondida no se pide NUNCA (lo que se pide queda «Lo vio»); esa regla es del módulo, no de la página');
        const caja = cajaDe(b);
        assert.ok(caja, f + ': no se entiende qué caja devuelve `caja` en:\n' + b.slice(0, 200));
        vistas[caja] = b;
      }
      for (const caja of Object.keys(p.cajas)) {
        assert.ok(vistas[caja], f + ': no hay ningún ChatVivo.hilo cuya caja sea #' + caja + ' (se armó a mano, o con otro nombre)');
      }
    });
  }
});

/* ========================================================================== */
describe('3. esMio dice de qué lado está quien mira', () => {

  for (const [f, p] of Object.entries(PAGINAS)) {
    test(f + ': ' + Object.entries(p.cajas).map(([c, l]) => '#' + c + ' → ' + l).join(', '), () => {
      const porCaja = {};
      for (const b of bloquesHilo(CODIGO[f])) porCaja[cajaDe(b)] = b;
      for (const [caja, lado] of Object.entries(p.cajas)) {
        assert.equal(ladoDe(porCaja[caja] || ''), lado,
          f + ' #' + caja + ': esMio tendría que decir «' + lado + '». Con el otro lado, lo que uno mismo acaba de mandar no baja, y lo del otro sí arrastra la pantalla de quien lee arriba');
      }
    });
  }
});

/* ========================================================================== */
describe('4. ninguna página llama a un nombre que el módulo no tiene', () => {

  const exporta = new Set(Object.keys(MODULO));

  test('el módulo exporta lo que su cabecera promete', () => {
    for (const k of ['juntar', 'ultimoIdDe', 'hilo', 'lista', 'timbre', 'titulo']) assert.ok(exporta.has(k), 'falta ' + k);
    const h = MODULO.hilo({ pedir: () => Promise.resolve([]), reloj: { setInterval: () => 1, clearInterval: () => {} }, documento: {} });
    for (const k of ['arrancar', 'cargar', 'latir', 'parar', 'estado']) assert.equal(typeof h[k], 'function', 'hilo().' + k);
    const l = MODULO.lista({ pedir: () => Promise.resolve(), reloj: { setInterval: () => 1, clearInterval: () => {} }, documento: {} });
    for (const k of ['arrancar', 'parar', 'reanudar', 'latir', 'estado']) assert.equal(typeof l[k], 'function', 'lista().' + k);
    const t = MODULO.timbre({ almacen: null, crear: null });
    for (const k of ['sonar', 'apagado', 'poner']) assert.equal(typeof t[k], 'function', 'timbre().' + k);
    assert.equal(t.sonar(), false, 'sin AudioContext no puede sonar (ninguna prueba suena)');
  });

  for (const f of Object.keys(PAGINAS)) {
    test(f, () => {
      const usados = new Set();
      const re = /\b(?:ChatVivo|VIVO)\.([A-Za-z_]\w*)/g;
      let m;
      while ((m = re.exec(CODIGO[f]))) usados.add(m[1]);
      assert.ok(usados.has('hilo'), f + ' no usa ChatVivo.hilo');
      for (const k of usados) assert.ok(exporta.has(k), f + ' llama a ChatVivo.' + k + ', que el módulo no exporta: en el navegador es «undefined is not a function» y la pantalla se queda quieta');
    });
  }
});

/* ========================================================================== */
describe('5. el reloj de 8 s del hilo no se escribe a mano en ninguna página', () => {

  for (const f of Object.keys(PAGINAS)) {
    test(f, () => {
      assert.doesNotMatch(CODIGO[f], /setInterval\([^;]*,\s*8000\s*\)/,
        f + ' arma un setInterval de 8 s propio: el reloj del hilo vive en app/chat-vivo.js para que las tres pantallas no deriven');
      assert.doesNotMatch(CODIGO[f], /function\s+juntar(Mensajes)?\s*\(/,
        f + ' escribe su propio juntar por id: ya lo hace ChatVivo.juntar');
    });
  }
});

/* ========================================================================== */
describe('6. honestidad: nadie dice «tiempo real», y la frase vieja del 🔔 se fue', () => {

  for (const f of Object.keys(PAGINAS)) {
    test(f + ' no dice «tiempo real»', () => {
      assert.doesNotMatch(CODIGO[f], /tiempo real/i, f + ' promete tiempo real: lo que hay es un reloj de 8 s a la vista');
    });
  }

  test('el CRM ya no promete el globo «aunque tengas el CRM en otra pestaña» (la frase publicada hasta el 30-oct)', () => {
    assert.doesNotMatch(CODIGO['panel/crm.html'], /aunque tengas el CRM en otra pestaña/,
      'la frase vieja del 🔔 sigue: prometía un globo que el reloj escondido no daba');
    assert.match(CODIGO['panel/crm.html'], /Con el CRM cerrado, no\./, 'la frase nueva del 🔔 tiene que decir también lo que NO pasa');
  });
});
