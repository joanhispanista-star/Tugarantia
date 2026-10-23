/* ============================================================================
 * LA GARANTÍA EN UNA LÍNEA — 21 de octubre de 2026
 *
 *   node --test pruebas/la-garantia-en-una-linea.test.js
 *
 * Joan: «en la app de cliente explica lo que tu construyes pero es mucha cosa
 * lo que explica, solo quiero que diga que cada vez que pagas cumplidamente la
 * app te suma garantia». Se le explicó que «plata» no se puede (términos §6 y
 * captación: la garantía no es un saldo del cliente) y ELIGIÓ esta frase,
 * textual:
 *
 *   «Cada crédito que pagas te suma garantía, y tu garantía es tu cupo: lo que
 *    puedes pedir en la app.»
 *
 * Lo que había el 21-oct, medido arrancando la app (banco-socio.js):
 *   · INICIO, con el socio al día, decía la MISMA regla tres veces: en «Puedes
 *     pedir hasta» («80 centavos de cada peso de costo se te vuelven garantía
 *     tuya»), en «Tu garantía» («Es tu historial hecho número… 80 centavos…») y
 *     en el renglón del nivel («Cada crédito que pagas te acerca: 80
 *     centavos…»). Eso es el «mucha cosa».
 *   · MI GARANTÍA abría con el desglose ganada/prestada/comprometida y cinco
 *     tarjetas de explicación, unas 430 palabras, sin la regla en una línea.
 *   · LA PORTADA decía «Tres pasos, y el primero te da plata.»: lo que dan los
 *     datos es garantía PRESTADA, y los términos dicen que la garantía «NO es
 *     dinero tuyo». Un titular que contradice el contrato.
 *
 * Por qué se prueba ARRANCANDO la app y no leyendo el fuente: la regla repetida
 * vivía en tres funciones distintas (vistaInicio, textoProximoNivel y la
 * tarjeta del cupo) y solo se veía junta en la pantalla pintada. Y lo plegado se
 * prueba como lo ve el cliente: lo que hay dentro de un <details> cerrado no se
 * lee hasta que lo toca.
 *
 * Lo que NO se toca, y se vigila acá también: la letra que exige el acuerdo
 * (lo del 27-sep y lo que la prórroga NO hace) sigue en «Cómo funciona esto», y
 * esa pantalla se alcanza desde Mi garantía. Y la frase NO va en play/ (allí el
 * cupo sale del perfil, no de la garantía: sería falsa) ni en PlataChat.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../app/puente.js');
const { abrirSocio, RAIZ } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const FRASE = 'Cada crédito que pagas te suma garantía, y tu garantía es tu cupo: lo que puedes pedir en la app.';
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const veces = (t, s) => t.split(s).length - 1;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Lo que el cliente LEE sin tocar nada: de cada <details> cerrado solo se ve
   su <summary>. Uno abierto (con el atributo open) se lee entero. */
function aLaVista(html) {
  return plano(String(html).replace(/<details\b([^>]*)>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g,
    (todo, attrs, resumen, dentro) => (/\bopen\b/.test(attrs) ? resumen + ' ' + dentro : resumen)));
}
/* Y lo que queda guardado detrás del pliegue. */
function plegado(html) {
  const m = /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/.exec(String(html));
  return m ? { resumen: plano(m[1]), dentro: plano(m[2]), abierto: /\bopen\b/.test(m[0].slice(0, m[0].indexOf('>'))) } : null;
}

/* ------------------------------------------------------------------------
   UNA CLIENTA DE VERDAD, armada como la arma el CRM y empaquetada por el
   puente: un crédito ya pagado (garantía ganada) y, si se pide, uno abierto.
   ------------------------------------------------------------------------ */
/* `gananciaPago` es el costo que se cobró al cerrarlo: sin él, el puente no le
   acredita garantía ganada y la prueba miraría una clienta en ceros. */
function credito(id, extra) {
  return Object.assign({ id, numero: 1, socioId: 's1', socioNombre: 'Clienta Garantía', capital: 200000,
    costoPct: 20, fechaDesembolso: '2026-09-30', cicloActual: '2026-10-15', prorrogas: [], abonosCapital: [],
    comprobantes: [], pagado: true, fechaPago: '2026-10-15', cicloPago: '2026-10-15',
    gananciaPago: 40000, recargoMora: 0 }, extra || {});
}
function cartera(prestamos) {
  return {
    socios: [{ id: 's1', numero: 1, nombre: 'Clienta Garantía', cedula: '52111222', telefono: '3001112233',
               whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }],
    prestamos, config: { negocio: 'Tu Garantía' }
  };
}
async function appDeLaClienta(prestamos, dia) {
  const db = cartera(prestamos);
  const paquete = P.migrarSocio(db, db.socios[0], dia);
  const ahora = new Date(dia + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000,
    celular: '3001112233', paquete: { nombre: 'Clienta Garantía', datos: paquete,
      actualizado_en: dia + 'T10:00:00Z', origen: 'nube', cedula: '3001112233' } });
  const A = abrirSocio({ local: { socio_cuenta: sesion }, ahora });
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta: la prueba no estaría mirando nada');
  return A;
}
const ALDIA = () => appDeLaClienta([credito('c1')], '2026-10-21');
const CONCREDITO = () => appDeLaClienta([credito('c1'),
  credito('c2', { numero: 2, fechaDesembolso: '2026-10-16', cicloActual: '2026-10-30', pagado: false,
                  fechaPago: undefined, cicloPago: undefined, gananciaPago: 0 })],
  '2026-10-21');
const pantalla = (A, js) => { if (js) A.ev(js); return A.elem('cuerpo').innerHTML; };
const COP = (A, n) => A.ev('COP(' + Number(n) + ')');

/* ======================================================================== */
describe('Inicio dice la regla UNA vez, con la frase que eligió Joan', () => {

  test('al día: la tarjeta «Tu garantía» es la cifra y la frase, nada más de reglas', async () => {
    const A = await ALDIA();
    const t = aLaVista(pantalla(A));
    const g = COP(A, A.ev('S.garantia'));
    assert.ok(Number(A.ev('S.gd.ganada')) > 0, 'la clienta no tiene garantía ganada: la prueba no mira nada');
    assert.match(t, new RegExp('Tu garantía ' + esc(g) + ' ' + esc(FRASE)),
      'la tarjeta «Tu garantía» no dice la frase de Joan justo debajo de la cifra');
    assert.equal(veces(t, FRASE), 1, 'la frase sale ' + veces(t, FRASE) + ' veces en Inicio');
  });

  test('al día: ni «Puedes pedir hasta» ni el renglón del nivel repiten los centavos', async () => {
    const t = aLaVista(pantalla(await ALDIA()));
    assert.equal(veces(t, 'centavos de cada peso'), 0,
      'Inicio sigue explicando la regla de los centavos: ' + veces(t, 'centavos de cada peso') + ' veces');
    assert.ok(!/historial hecho número|No se retira|te acerca:/.test(t), 'quedó una de las repeticiones viejas');
    /* Lo que sí se queda: las cifras y la acción. */
    assert.match(t, /Puedes pedir hasta \$[\d.]+/);
    assert.match(t, /Calcular y pedir/);
    assert.match(t, /Te faltan \$[\d.]+ de garantía para pasar a \S+/);
  });

  test('con un crédito por pagar: la frase sale una vez y los centavos ninguna', async () => {
    const A = await CONCREDITO();
    const t = aLaVista(pantalla(A));
    assert.match(t, /Este corte tienes que pagar/, 'la clienta no tiene nada por pagar: la prueba no mira esa rama');
    assert.equal(veces(t, FRASE), 1);
    assert.equal(veces(t, 'centavos de cada peso'), 0);
  });

  test('en el nivel más alto no vuelve a explicar que el cupo es la garantía', async () => {
    const A = await ALDIA();
    A.ev('S.garantia = 999999999; S.nivel = M.proyeccionNiveles(999999999, S.nivel).slice(-1)[0].nivel;');
    const t = A.ev('textoProximoNivel()');
    assert.equal(A.ev('siguienteNivel()'), null, 'no quedó en el nivel más alto');
    assert.ok(!/garantía|cupo/.test(t), 'el renglón del nivel repite la regla: ' + t);
    assert.match(t, /nivel más alto/);
  });
});

/* ======================================================================== */
describe('Mi garantía abre con la frase; el detalle, a un toque', () => {

  test('lo primero que se lee debajo de la cifra es la frase', async () => {
    const A = await ALDIA();
    const t = aLaVista(pantalla(A, "irA('garantia')"));
    const g = COP(A, A.ev('S.garantia'));
    assert.ok(t.indexOf('Tu garantía ' + g + ' ' + FRASE) === 0,
      'Mi garantía no abre con «Tu garantía, la cifra y la frase»: ' + t.slice(0, 160));
    assert.equal(veces(t, FRASE), 1);
  });

  test('a la vista: la frase, el cupo y las acciones; el desglose y las explicaciones, plegados', async () => {
    const A = await ALDIA();
    const h = pantalla(A, "irA('garantia')");
    const t = aLaVista(h);
    assert.match(t, new RegExp('Con eso puedes pedir ' + esc(COP(A, A.ev('S.cupo')))), 'se perdió la cifra del cupo');
    ['Ganada', 'Prestada', 'Tus niveles', 'centavos de cada peso', 'La plataforma presta hasta'].forEach(s =>
      assert.ok(t.indexOf(s) < 0, '«' + s + '» se lee sin tocar «Ver cómo funciona»'));
    /* Las acciones no se pliegan: «Completar y ganar» es la ÚNICA puerta a
       abrirPerfil, y una función que nadie encuentra no existe. */
    assert.match(t, /Completar y ganar \$[\d.]+/);
    assert.match(t, /Invitar a alguien/);
    assert.match(t, /Garantía que te dieron/);
  });

  test('el pliegue se llama «Ver cómo funciona», arranca cerrado y guarda el detalle completo', async () => {
    const A = await ALDIA();
    const p = plegado(pantalla(A, "irA('garantia')"));
    assert.ok(p, 'Mi garantía no tiene nada plegado');
    assert.equal(p.resumen, 'Ver cómo funciona');
    assert.equal(p.abierto, false, 'el pliegue arranca abierto: es lo mismo que no plegar');
    ['Ganada', 'pagando tus créditos', 'Prestada', 'por tus datos, para arrancar', 'Tus niveles',
     'centavos de cada peso de costo', 'La plataforma presta hasta'].forEach(s =>
      assert.ok(p.dentro.indexOf(s) >= 0, 'el detalle perdió «' + s + '»'));
    /* El «No se retira» salió de Inicio con la frase nueva; era lo único de la
       app que decía lo que la garantía NO es (términos §6). No se puede ir. */
    assert.match(p.dentro, /No es un ahorro ni un depósito, y no se retira/);
  });

  test('con el perfil completo, la tarjeta del perfil ya no pide nada y se pliega', async () => {
    const A = await ALDIA();
    A.ev("M.garantiaPorDatos(S.perfil).faltantes.forEach(function (d) { S.perfil[d.id] = 'listo'; });");
    assert.equal(A.ev('M.garantiaPorDatos(S.perfil).faltantes.length'), 0, 'el perfil no quedó completo');
    const h = pantalla(A, "irA('garantia')");
    assert.ok(aLaVista(h).indexOf('Completa tu perfil') < 0, 'un perfil completo sigue ocupando la vista');
    assert.match(plegado(h).dentro, /Tienes el perfil completo/);
  });

  test('desde el pliegue se llega a «Cómo funciona esto», con la letra del 27-sep y de la prórroga', async () => {
    const A = await ALDIA();
    const h = pantalla(A, "irA('garantia')");
    const dentro = /<details\b[\s\S]*?<\/details>/.exec(h)[0];
    assert.match(dentro, /onclick="verReglas\(\)"/, 'desde Mi garantía no se llega a las reglas completas');
    assert.match(plano(dentro), /Cómo funciona esto/);
    const r = plano(pantalla(A, 'verReglas()'));
    assert.match(r, /27 de septiembre de 2026/);
    assert.match(r, /Lo que la prórroga no hace es volver garantía el recargo/);
    /* Y al volver, vuelve a donde estaba, no a Inicio. */
    assert.match(pantalla(A), /onclick="irA\('garantia'\)"[^>]*>Volver/);
  });

  test('con préstamo con garantía disponible, la oferta y su botón van en el detalle, no se borran', async () => {
    const A = await ALDIA();
    A.ev('S.maxRespaldado = 1500000;');
    const h = pantalla(A, "irA('garantia')");
    const p = plegado(h);
    assert.match(p.dentro, /Préstamo con garantía/);
    assert.match(/<details\b[\s\S]*?<\/details>/.exec(h)[0], /onclick="irACalcRespaldado\(\)"/);
  });
});

/* ======================================================================== */
describe('la portada no dice que los datos dan plata', () => {

  test('«Tres pasos, y el primero ya te da cupo.»', () => {
    const W = leer('index.html').replace(/<!--[\s\S]*?-->/g, '');
    assert.match(W, /<h2[^>]*>Tres pasos, y el primero ya te da cupo\.<\/h2>/);
    assert.ok(!/te da plata/.test(W), 'la portada sigue diciendo que el primer paso da plata');
  });
});

/* ======================================================================== */
describe('la frase vive donde es verdad', () => {

  test('socio.html la escribe una sola vez y las dos pantallas la usan', () => {
    const S = leer('app/socio.html');
    assert.equal(veces(S, FRASE), 1, 'la frase está escrita a mano más de una vez');
    assert.match(S, /var FRASE_GARANTIA = '/);
  });

  test('no está en play/ (el cupo sale del perfil) ni en PlataChat', () => {
    ['play/index.html', 'platachat/index.html', 'app/motor.js'].forEach(f => {
      const t = leer(f);
      assert.ok(t.indexOf(FRASE) < 0, f + ' lleva la frase de la app instalada');
    });
    assert.ok(!/tu garantía es tu cupo/i.test(leer('play/index.html')),
      'play/ dice que la garantía es el cupo, y allí el cupo sale del perfil');
  });
});
