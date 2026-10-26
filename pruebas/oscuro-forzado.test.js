'use strict';
/* ==========================================================================
 * EL OSCURO FORZADO NO SE COME LO CLARO — 23-oct-2026
 *
 *   node --test pruebas/oscuro-forzado.test.js
 *
 * Joan, el 23-oct, desde un Android: «volví a ver los muñecos de baja
 * calidad». La auditoría de ese día (scratchpad auditoria-23/sintesis.md)
 * encontró que los dibujos no habían cambiado, pero sí un hueco: un navegador
 * que OSCURECE LA PÁGINA POR SU CUENTA (Samsung Internet en modo oscuro lo
 * hace de fábrica; Chrome solo con una bandera) no mira nuestros tokens:
 * repinta los fondos. Medido en Chrome sin ventana con la bandera que lo imita:
 *
 *   · la placa «clara y fija» de los muñecos (.gente-esc, play/estilo.css) se
 *     volvía oscura, y con el motor viejo los muñecos salían como siluetas
 *     blancas sin cara;
 *   · la regla del 22-sep («donde se escribe, blanco con letra negra, en los
 *     dos modos», play/index.html) pasaba a #121212: el celular, la
 *     contraseña, el monto y la fecha, negro sobre negro otra vez;
 *   · lo mismo la casilla del monto libre de la calculadora (.cs .cs-libre).
 *
 * El blindaje es color-scheme:only light en las tres reglas. Tiene que ser
 * «only light»: con «light» a secas el navegador vuelve a forzar el oscuro.
 *
 * Y la regla del 22-sep no la vigilaba nadie (grep vacío en pruebas/): acá
 * se exige que siga en blanco #FFFFFF con letra #0C0A0B.
 *
 * Lo que esta prueba NO sabe: si Samsung Internet de verdad respeta
 * color-scheme. Eso se ve en un teléfono, no aquí.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* Las declaraciones de UNA regla, sin espacios, para buscar «prop:valor». */
function declaraciones(cuerpo) {
  return cuerpo.replace(/\s+/g, '').toLowerCase();
}

/* «only light» y nada de «light» a secas: la segunda deja que el navegador
   vuelva a oscurecer. */
function exigeSoloClaro(cuerpo, quien) {
  const d = declaraciones(cuerpo);
  const valores = [...d.matchAll(/color-scheme:([^;}]+)/g)].map(m => m[1]);
  assert.ok(valores.length > 0, quien + ': no declara color-scheme; el oscuro forzado la repinta');
  for (const v of valores) {
    assert.equal(v, 'onlylight', quien + ': color-scheme:' + v + ' — tiene que ser «only light»; '
      + 'con «light» a secas el navegador que oscurece la página la vuelve a oscurecer');
  }
}

/* La regla cuyo selector contiene `marca`, en una hoja sin comentarios. */
function reglaCon(hoja, marca) {
  const limpia = sinComentarios(hoja);
  const i = limpia.indexOf(marca);
  assert.ok(i >= 0, 'no encontré la regla «' + marca + '»');
  const abre = limpia.indexOf('{', i);
  const cierra = limpia.indexOf('}', abre);
  return { selector: limpia.slice(i, abre), cuerpo: limpia.slice(abre + 1, cierra) };
}

describe('el oscuro forzado no se come lo claro (23-oct-2026)', () => {
  test('la placa de los muñecos (.gente-esc) es only light', () => {
    const hoja = leer('play/estilo.css');
    const r = reglaCon(hoja, '.gente-esc{');
    exigeSoloClaro(r.cuerpo, 'play/estilo.css .gente-esc');
  });

  test('la regla del 22-sep (donde se escribe) sigue blanca con letra negra y es only light', () => {
    const html = leer('play/index.html');
    /* La regla vive en línea, en el primer <style> de la página, y le gana a
       la de play/estilo.css por ir después. La que importa es la que pinta
       las casillas de teclear de blanco. */
    const estilos = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    const limpia = sinComentarios(estilos);
    const re = /(input\[type=text\][^{]*textarea)\s*\{([^}]*)\}/g;
    const reglas = [...limpia.matchAll(re)].filter(m => /background:\s*#FFFFFF/i.test(m[2]));
    assert.equal(reglas.length, 1, 'la regla del 22-sep tiene que estar UNA vez en play/index.html');
    const [, selector, cuerpo] = reglas[0];
    for (const tipo of ['text', 'tel', 'password', 'number', 'email', 'date']) {
      assert.ok(selector.includes('input[type=' + tipo + ']'), 'la regla del 22-sep perdió input[type=' + tipo + ']');
    }
    const d = declaraciones(cuerpo);
    assert.match(d, /(^|;)background:#ffffff(;|$)/, 'donde se escribe: fondo #FFFFFF (regla del 22-sep)');
    assert.match(d, /(^|;)color:#0c0a0b(;|$)/, 'donde se escribe: letra #0C0A0B (regla del 22-sep)');
    exigeSoloClaro(cuerpo, 'play/index.html, regla del 22-sep');
  });

  test('la casilla del monto libre de la calculadora (.cs .cs-libre) es only light', () => {
    /* La hoja de la calculadora va armada en cadenas de JS: se pegan los
       trozos (quitando «' +» y el salto) antes de buscar la regla. */
    const fuente = sinComentarios(leer('app/calculadora-solicitud.js'));
    const pegada = fuente.replace(/'\s*\+\s*'/g, '');
    const r = reglaCon(pegada, '.cs .cs-libre{');
    const d = declaraciones(r.cuerpo);
    assert.match(d, /background:#ffffff/, '.cs-libre: fondo blanco');
    assert.match(d, /color:#0c0a0b/, '.cs-libre: letra #0C0A0B');
    exigeSoloClaro(r.cuerpo, 'app/calculadora-solicitud.js .cs .cs-libre');
  });

  test('el ayudante caza «light» a secas (control: la prueba sí ve la diferencia)', () => {
    assert.throws(() => exigeSoloClaro('background:#fff;color-scheme:light', 'control'), /only light/);
    assert.throws(() => exigeSoloClaro('background:#fff', 'control'), /no declara/);
    assert.doesNotThrow(() => exigeSoloClaro('background:#fff;color-scheme: only light', 'control'));
  });
});

/* ==========================================================================
 * LA MARCA DE ORO Y EL OJO DE LA CONTRASEÑA — 23-oct-2026, segunda vuelta
 *
 * La auditoría de la rama encontró dos huecos más del mismo oscuro forzado,
 * los dos medidos en Chrome 155 sin ventana con la bandera que lo imita:
 *
 *   · LA G DE ORO (f1956a2) salía café y plana: sin brillo, sin bisel, y la
 *     punta que gira en el anillo, un punto oscuro. Joan había pedido justo lo
 *     contrario («un color más oro y que parezca que brilla»). Proteger la G
 *     sola NO alcanza: el oro, el bisel y las máscaras viven en el <svg> de
 *     moldes del principio del <body>, fuera de la G, y el navegador repinta
 *     esos colores donde están definidos. Con #hola, la G y el <svg> de
 *     moldes en only light, la G vuelve a salir dorada. La marca en imagen
 *     (app/marca.svg en legal/, descargas/, el borrado de cuenta y la
 *     configuración) igual: .marca-img.
 *   · EL OJO DE LA CONTRASEÑA (b184d4a): la casilla quedó blanca por la regla
 *     de arriba, pero el botón del ojo es otro elemento y el navegador lo
 *     siguió oscureciendo: su trazo #0C0A0B («viendo») salía BLANCO sobre la
 *     casilla blanca. Lo que se dibuja ENCIMA de una casilla protegida tiene
 *     que ser only light también.
 * ======================================================================== */

/* Las hojas EN LÍNEA de una página, sin comentarios. */
function hojasEnLinea(html) {
  return sinComentarios([...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n'));
}
/* Las reglas cuyo selector, separado por comas, incluye EXACTAMENTE `selector`. */
function reglasDe(hoja, selector) {
  const quiero = selector.replace(/\s+/g, ' ').trim();
  return [...hoja.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m => m[1].split(',').map(s => s.replace(/\s+/g, ' ').trim()).includes(quiero))
    .map(m => ({ selector: m[1].trim(), cuerpo: m[2] }));
}
/* Alguna regla de `selector` es only light, y ninguna dice otra cosa. */
function exigeSelectorSoloClaro(hoja, selector, quien) {
  const conEsquema = reglasDe(hoja, selector).filter(r => /color-scheme/.test(r.cuerpo));
  assert.ok(conEsquema.length > 0, quien + ': «' + selector + '» no declara color-scheme; el oscuro forzado la repinta');
  for (const r of conEsquema) exigeSoloClaro(r.cuerpo, quien + ' ' + selector);
}
/* El <svg> de moldes: el primero que abre <defs> (el del principio del <body>). */
function svgDeMoldes(html) {
  const cuerpo = html.slice(html.indexOf('<body'));
  const m = /<svg\b([^>]*)>\s*<defs>/.exec(cuerpo.replace(/<!--[\s\S]*?-->/g, ''));
  assert.ok(m, 'no encontré el <svg> de moldes');
  return m[1];
}

describe('la marca de oro y el ojo de la contraseña tampoco se oscurecen (23-oct-2026)', () => {

  for (const f of ['app/socio.html', 'index.html', 'play/index.html']) {
    test(f + ': la G de oro, la palabra y el <svg> de moldes son only light', () => {
      const html = leer(f);
      const hoja = hojasEnLinea(html);
      exigeSelectorSoloClaro(hoja, '.marca .g', f);
      exigeSelectorSoloClaro(hoja, '.marca .palabra', f);
      /* En su style="" y no en una hoja: el <svg> de moldes es lo primero del
         <body> y tiene que valer aunque la hoja sea la de antes. */
      const estilo = (/style="([^"]*)"/.exec(svgDeMoldes(html)) || [])[1] || '';
      assert.ok(/color-scheme/.test(estilo),
        f + ': el <svg> de moldes no es only light; el oro y las máscaras viven ahí y el navegador los repinta café');
      exigeSoloClaro(estilo, f + ' <svg> de moldes');
    });
  }

  test('app/socio.html: la bienvenida (#hola) es only light', () => {
    exigeSelectorSoloClaro(hojasEnLinea(leer('app/socio.html')), '#hola', 'app/socio.html');
  });

  test('la marca en imagen (.marca-img) es only light donde se usa', () => {
    for (const f of ['legal/terminos.html', 'legal/privacidad.html', 'descargas/index.html', 'play/borrar-cuenta.html', 'app/socio.html']) {
      exigeSelectorSoloClaro(hojasEnLinea(leer(f)), '.marca-img', f);
    }
    /* La de la configuración de socio.html la arma pantallaConfig: también
       lleva la clase, o la regla no la alcanza. */
    const S = leer('app/socio.html');
    const config = S.slice(S.indexOf('function pantallaConfig()'), S.indexOf('function pantallaConfig()') + 600);
    assert.match(config, /<img class="marca-img" src="marca\.svg"/, 'la marca de la configuración no lleva .marca-img');
  });

  test('play/index.html: el ojo de la contraseña es only light, como la casilla sobre la que se dibuja', () => {
    exigeSelectorSoloClaro(hojasEnLinea(leer('play/index.html')), '.clave-caja .ojo', 'play/index.html');
  });

  test('el ayudante de selectores no se deja engañar (control)', () => {
    const hoja = '.a .b{color:red}.x,.marca .g{color-scheme:only light}.marca .gg{color-scheme:light}';
    assert.doesNotThrow(() => exigeSelectorSoloClaro(hoja, '.marca .g', 'control'));
    assert.throws(() => exigeSelectorSoloClaro(hoja, '.marca .gg', 'control'), /only light/);
    assert.throws(() => exigeSelectorSoloClaro(hoja, '.a .b', 'control'), /no declara/);
    assert.throws(() => exigeSelectorSoloClaro(hoja, '.marca', 'control'), /no declara/);
  });
});
/* ==========================================================================
 * DONDE SE ELIGE, TAMBIÉN BLANCO — 26-oct-2026
 *
 * Joan, desde el iPhone en modo oscuro: «hay espacios en blanco para uno
 * escribir pero también hay espacios en negro que confunden y parece que no
 * tocara rellenar, deja todo de color blanco para rellenar». Los negros eran
 * los <select> («Toca para elegir»: tipo de documento, vivienda, cuánto lleva
 * ahí, ocupación, día de pago, banco, tipo de cuenta): la regla del 22-sep
 * solo nombraba los input donde se TECLEA, y el select seguía con
 * var(--papel), #151113 en el modo oscuro del teléfono.
 *
 * Lo que se fija aquí (todo en play/index.html, en línea):
 *   · la regla del 22-sep nombra select: así le toca el blanco, la letra
 *     negra, el borde y el only light, los mismos de las casillas de teclear;
 *   · hay una regla «select» propia que quita la flecha del navegador
 *     (appearance:none, con su -webkit-) y pinta una del tono de la letra con
 *     dos linear-gradient —sin imagen ni data: URI: un SVG lleva el xmlns de
 *     w3.org y cumplimiento.test.js lo lee como un servidor al que la app
 *     llama—, con padding derecho para que el texto no se le monte;
 *   · esa regla va DESPUÉS de la del 22-sep: el atajo background:#FFFFFF de
 *     aquella borra cualquier background-image que venga antes, y la flecha
 *     desaparecería sin que ninguna prueba de texto lo viera.
 *
 * Medido además en Chrome sin ventana (scratchpad lote-26/casillas-blancas,
 * recorrer.js): en los diez pasos del registro, en oscuro y en oscuro
 * forzado, todo control que se llena pinta fondo #FFFFFF y letra #0C0A0B.
 * En un iPhone o un Samsung de verdad no está verificado.
 * ======================================================================== */
describe('donde se elige también es blanco (26-oct-2026)', () => {
  const hoja = () => hojasEnLinea(leer('play/index.html'));

  test('la regla del 22-sep nombra select: blanco, letra negra, borde y only light', () => {
    const r = reglasDe(hoja(), 'select').filter(x => /background:\s*#FFFFFF/i.test(x.cuerpo));
    assert.equal(r.length, 1, 'select tiene que estar en la regla del 22-sep (la de background:#FFFFFF), una sola vez');
    assert.ok(r[0].selector.includes('input[type=text]'), 'es la regla del 22-sep, no otra parecida');
    const d = declaraciones(r[0].cuerpo);
    assert.match(d, /(^|;)color:#0c0a0b(;|$)/, 'select: letra #0C0A0B');
    assert.match(d, /(^|;)border-color:#d8d2cc(;|$)/, 'select: borde visible #D8D2CC');
    exigeSelectorSoloClaro(hoja(), 'select', 'play/index.html');
  });

  test('la flecha del select es propia: appearance:none y dos degradados, sin ninguna URL', () => {
    const propias = reglasDe(hoja(), 'select').filter(x => x.selector.trim() === 'select');
    assert.equal(propias.length, 1, 'tiene que haber UNA regla «select» a secas (la de la flecha)');
    const c = propias[0].cuerpo;
    const d = declaraciones(c);
    assert.match(d, /(^|;)appearance:none(;|$)/, 'select: appearance:none, o iOS y Android pintan su flecha encima de la nuestra');
    assert.match(d, /(^|;)-webkit-appearance:none(;|$)/, 'select: -webkit-appearance:none, por los Safari viejos');
    const degradados = [...d.matchAll(/linear-gradient\((\d+)deg,[^)]*#0c0a0b[^)]*\)/g)].map(m => Number(m[1]));
    assert.deepEqual(degradados.sort((x, y) => x - y), [45, 135], 'la flecha son dos trazos del tono de la letra (#0C0A0B): uno a 45° y otro a 135°');
    assert.doesNotMatch(c, /url\(/, 'select: ninguna URL en la flecha (un SVG llevaría el xmlns de w3.org y Data Safety lo lee como un servidor)');
    assert.doesNotMatch(d, /(^|;)background:/, 'select: nada de «background:» a secas en esta regla (borraría la flecha)');
    const pr = /(^|;)padding-right:(\d+)px(;|$)/.exec(d);
    assert.ok(pr && Number(pr[2]) >= 40, 'select: padding-right de 40px o más, para que el texto no se monte en la flecha');
  });

  test('la regla de la flecha va DESPUÉS de la del 22-sep (su background:#FFFFFF la borraría)', () => {
    const h = hoja();
    const i22 = h.search(/input\[type=text\][^{]*select,textarea\s*\{/);
    const iFlecha = h.search(/\}\s*select\s*\{/);
    assert.ok(i22 >= 0, 'no encontré la regla del 22-sep con select');
    assert.ok(iFlecha >= 0, 'no encontré la regla «select» de la flecha');
    assert.ok(iFlecha > i22, 'la regla de la flecha tiene que ir después de la del 22-sep');
  });

  test('el ayudante caza una flecha con URL o un background a secas (control)', () => {
    const d = declaraciones('background:#fff;background-image:url(https://x/y.svg)');
    assert.match(d, /(^|;)background:/);
    assert.match('background-image:url("data:image/svg+xml,%3Csvg")', /url\(/);
    assert.doesNotMatch('background-image:linear-gradient(45deg,transparent 41%,#0C0A0B 43%)', /url\(/);
  });
});
