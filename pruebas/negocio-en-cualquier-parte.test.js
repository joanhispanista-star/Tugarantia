/* ===========================================================================
 * TU NEGOCIO EN CUALQUIER PARTE
 *
 * Joan: «quiero que mi negocio no solo viva en mi computador, quiero poder
 * abrirlo desde cualquier parte».
 *
 * Lo que se encontró al ir a construirlo: YA ESTABA CONSTRUIDO Y NO HABÍA FORMA
 * DE LLEGAR. El Panel del bolsillo (panel/espejo.html) sincroniza en los dos
 * sentidos, resuelve choques y deja registrar pagos, abonos, prórrogas,
 * gestiones y clientes desde cualquier teléfono. La página que sube la cartera
 * (panel/subir.html) existe desde agosto. Las dos están publicadas — y ninguna
 * estaba enlazada desde el CRM. Había que saberse la dirección de memoria.
 *
 * Una herramienta que salva el negocio y que hay que adivinar cómo abrir no está
 * construida a medias: está construida y perdida. Esta prueba existe para que no
 * se vuelva a perder.
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');

describe('se puede LLEGAR a lo que ya existe (15-sep-2026)', () => {

  test('el CRM enlaza las tres páginas, no solo las menciona en comentarios', () => {
    /* La diferencia entre estar y poder abrirse. Antes de hoy, «espejo.html»
       aparecía en crm.html UNA vez: dentro de un comentario. */
    const sinComentarios = CRM.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const pagina of ['espejo.html', 'subir.html', 'traer.html']) {
      assert.match(sinComentarios, new RegExp('href="' + pagina.replace('.', '\.') + '"'),
        'el CRM no tiene un enlace a ' + pagina + ': hay que saberse la dirección de memoria');
    }
  });

  test('las tres páginas EXISTEN de verdad', () => {
    for (const pagina of ['espejo.html', 'subir.html', 'traer.html', 'nube.js']) {
      assert.ok(fs.existsSync(path.join(RAIZ, 'panel', pagina)),
        'se enlaza panel/' + pagina + ' y no existe');
    }
  });

  test('los enlaces abren en otra pestaña y sin abrir puerta al que los reciba', () => {
    /* target="_blank" sin rel="noopener" le da a la página abierta una manija
       sobre la que la abrió. Acá son páginas propias, pero la regla no se
       relaja por eso: se relaja una vez y después nadie sabe cuál era la
       excepción. */
    const i = CRM.indexOf('Tu negocio en cualquier parte');
    assert.ok(i > -1, 'no existe la sección');
    const bloque = CRM.slice(i, CRM.indexOf('Compartir con mis clientes', i));
    const enlaces = bloque.match(/<a [^>]*href="[^"]+\.html"[^>]*>/g) || [];
    assert.equal(enlaces.length, 3, 'se esperaban tres enlaces, hay ' + enlaces.length);
    for (const a of enlaces) {
      assert.match(a, /target="_blank"/, 'un enlace se lleva el CRM: ' + a);
      assert.match(a, /rel="noopener"/, 'un enlace sin noopener: ' + a);
    }
  });

  test('la sección dice POR QUÉ importa, no solo qué hacer', () => {
    const i = CRM.indexOf('Tu negocio en cualquier parte');
    const bloque = CRM.slice(i, CRM.indexOf('Compartir con mis clientes', i));
    assert.match(bloque, /se pierde quién te debe qué/i,
      'no se dice la consecuencia de no hacerlo');
  });
});

describe('la cartera no se puede perder en silencio (15-sep-2026)', () => {

  test('se le pide al navegador que NO borre el almacenamiento', () => {
    /* Sin esto, Chrome tiene derecho a desalojar el localStorage cuando el
       disco se aprieta, sin avisar. Se ve exactamente igual que «se perdieron
       mis datos», que es lo peor que puede parecer un CRM. */
    /* Se comprueba EJECUTANDO. La primera version buscaba el texto
       «navigator.storage.persist» en el archivo; se le metio el error a
       proposito cambiando la condicion del if por `false` —dejando la llamada
       mas abajo, intacta— y no lo vio. Un centinela que busca texto aprueba
       cualquier cosa que no borre palabras. */
    const { abrirPanel } = require('./banco-panel.js');
    const P = abrirPanel();
    return asentar().then(() => {
      assert.equal(P.ev('_pidioPersistir'), true,
        'el CRM NO le pidió al navegador que no borre la cartera');
    });
    /* Y va en un try: un navegador viejo que no conozca la función no puede
       tumbar el arranque del CRM. */
    const i = CRM.indexOf('function pedirQueNoBorren');
    assert.ok(i > -1);
    assert.match(CRM.slice(i, CRM.indexOf('}());', i)), /try \{/,
      'si el navegador no conoce la función, el CRM no arranca');
  });

  test('el respaldo anota la fecha, y el archivo la lleva en el nombre', () => {
    /* «respaldo-tugarantia.json» a secas se pisa a sí mismo en la carpeta de
       descargas: quien tenga diez copias tiene una sola. */
    const i = CRM.indexOf('function exportar()');
    assert.ok(i > -1);
    const cuerpo = CRM.slice(i, CRM.indexOf('\n/* Cuanto hace', i));
    assert.match(cuerpo, /respaldo-tugarantia-' \+ hoy/,
      'el archivo del respaldo no lleva la fecha en el nombre');
    assert.match(cuerpo, /DB\.config\.ultimoRespaldo = hoy/,
      'no se anota cuándo fue el último respaldo');
    assert.match(cuerpo, /guardar\(\)/, 'se anota la fecha y no se guarda');
  });

  test('y se DICE cuánto hace, donde se ve', () => {
    const i = CRM.indexOf('function pintarAvisoRespaldo');
    assert.ok(i > -1, 'nada dice cuánto hace del último respaldo');
    const c = CRM.slice(i, CRM.indexOf('\n}', CRM.indexOf('dias >= 7', i)));
    assert.match(c, /Nunca has bajado un respaldo/,
      'si nunca se ha respaldado, no se dice');
    assert.match(c, /dias >= 7/, 'no hay umbral: el aviso nunca cambia de tono');
    /* Y se pinta al entrar a Ajustes, que es donde está el botón. */
    assert.match(CRM, /if\(v==='cfg'\)\{pintarCfg\(\);pintarAvisoRespaldo\(\);\}/,
      'el aviso existe y no se pinta nunca');
  });

  test('el aviso NO promete que la nube reemplaza al respaldo', () => {
    /* Son dos cosas distintas: la nube es para trabajar desde otra parte; el
       archivo es la copia que nadie te puede quitar. Confundirlas es cómo se
       deja de hacer respaldos. */
    const i = CRM.indexOf('Tu negocio en cualquier parte');
    const bloque = CRM.slice(i, CRM.indexOf('Compartir con mis clientes', i));
    assert.match(bloque, /respaldo en archivo sigue siendo tuyo/i);
  });
});
